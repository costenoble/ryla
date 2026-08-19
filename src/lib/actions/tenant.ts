"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import {
  getTenantSelf,
  updateTenantSelf,
  type TenantSettingsInput,
} from "@/lib/repos/tenants";
import { documentStore } from "@/lib/storage";
import type { TenantBranding } from "@/lib/tenant";
import type { LetterheadBlock } from "@/lib/letterhead";

/**
 * Réglages du cabinet.
 *
 * Ces champs ne sont pas du confort : le cabinet est responsable de traitement
 * au sens de l'article 28 du RGPD, Ryla n'est que sous-traitant. Ses mentions
 * légales et son contact DPO sont *les siens* — les lui rendre inéditables le
 * mettrait en travers de sa propre conformité.
 *
 * Comme partout ailleurs, l'action vit hors de `src/app/(praticien)/…` : une
 * Server Action définie sous un groupe de routes à layout asynchrone ne
 * s'exécute pas sur Vercel (cf. le commentaire détaillé dans `dossiers.ts`).
 */

export type SettingsState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function readColor(formData: FormData, field: string): string | undefined {
  const value = String(formData.get(field) ?? "").trim();
  return HEX_COLOR.test(value) ? value : undefined;
}

const SIZES = new Set(["title", "normal", "small"]);
const ALIGNS = new Set(["left", "center", "right"]);

/**
 * Lit l'en-tête composé, transmis en JSON par l'éditeur.
 *
 * Revalidé intégralement : la mise en forme finit dans un PDF rendu côté
 * serveur, et une taille inconnue y ferait échouer la génération d'un document
 * signé — au pire moment, celui où le patient valide.
 */
function readLetterheadBlocks(formData: FormData): LetterheadBlock[] {
  try {
    const raw: unknown = JSON.parse(String(formData.get("letterheadBlocks") ?? "[]"));
    if (!Array.isArray(raw)) return [];

    return raw
      .slice(0, 12)
      .map((entry) => {
        const block = entry as Record<string, unknown>;
        const size = String(block.size ?? "normal");
        const align = String(block.align ?? "left");
        return {
          text: String(block.text ?? "").slice(0, 200),
          bold: block.bold === true,
          size: (SIZES.has(size) ? size : "normal") as LetterheadBlock["size"],
          align: (ALIGNS.has(align) ? align : "left") as LetterheadBlock["align"],
        };
      })
      .filter((block) => block.text.trim() !== "");
  } catch {
    return [];
  }
}

export async function saveTenantSettings(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSession();
  const client = await requestContext();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { status: "error", message: "Le nom du cabinet est obligatoire." };
  }

  const letterheadMode = String(formData.get("letterheadMode") ?? "none");
  if (!["none", "text", "image"].includes(letterheadMode)) {
    return { status: "error", message: "Format d'en-tête inconnu." };
  }

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        // On relit la fiche pour ne pas écraser ce que le formulaire ne porte
        // pas — la clé de l'image d'en-tête, notamment, qui est posée par une
        // autre action.
        const current = await getTenantSelf(tx);

        const branding: TenantBranding = {
          ...current.branding,
          primaryColor: readColor(formData, "primaryColor"),
          accentColor: readColor(formData, "accentColor"),
          senderName: String(formData.get("senderName") ?? "").trim() || undefined,
          letterheadMode: letterheadMode as TenantBranding["letterheadMode"],
          letterheadBlocks: readLetterheadBlocks(formData),
          // L'ancien champ libre reste écrit : il sert de repli si une version
          // plus ancienne de l'application relit la fiche.
          letterheadText: readLetterheadBlocks(formData)
            .map((block) => block.text)
            .join("\n"),
        };

        const input: TenantSettingsInput = {
          name,
          legalName: String(formData.get("legalName") ?? "").trim() || null,
          siret: String(formData.get("siret") ?? "").trim() || null,
          finess: String(formData.get("finess") ?? "").trim() || null,
          address: {
            street: String(formData.get("street") ?? "").trim(),
            postalCode: String(formData.get("postalCode") ?? "").trim(),
            city: String(formData.get("city") ?? "").trim(),
            phone: String(formData.get("phone") ?? "").trim(),
          },
          branding,
          dpoContact: {
            name: String(formData.get("dpoName") ?? "").trim(),
            email: String(formData.get("dpoEmail") ?? "").trim(),
          },
          legalNotice: String(formData.get("legalNotice") ?? "").trim() || null,
        };

        await updateTenantSelf(tx, input);

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "tenant.settings_updated",
          objectType: "tenant",
          objectId: session.tenant.id,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { letterheadMode },
        });
      },
    );

    return { status: "saved" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'enregistrement a échoué.",
    };
  }
}

// ---------------------------------------------------------------------------
// Fiche du praticien
// ---------------------------------------------------------------------------

export type PractitionerState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

/**
 * Identité professionnelle de l'utilisateur connecté.
 *
 * Le RPPS n'est pas un champ décoratif : l'arrêté du 31 octobre 2020 impose
 * l'identifiant du praticien sur le devis conventionnel, et `checkCerfaCompleteness`
 * refuse d'enregistrer sans lui. Tant qu'il n'était modifiable que par script,
 * un cabinet créé sans RPPS ne pouvait tout simplement pas établir de devis —
 * sur un message d'erreur qui ne disait pas où le corriger.
 *
 * Chacun ne modifie que sa propre fiche : `where id = <utilisateur en session>`,
 * et le RLS borne déjà la table au cabinet.
 */
export async function savePractitioner(
  _previous: PractitionerState,
  formData: FormData,
): Promise<PractitionerState> {
  const session = await requireSession();
  const client = await requestContext();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const rpps = String(formData.get("rpps") ?? "").trim();
  const specialityLabel = String(formData.get("specialityLabel") ?? "").trim();

  if (!fullName) {
    return { status: "error", message: "Le nom du praticien est obligatoire." };
  }
  // Onze chiffres pour un RPPS, neuf pour un ADELI. On accepte les deux et on
  // refuse le reste : un identifiant mal saisi fait rejeter le devis par la
  // complémentaire, bien plus tard et sans qu'on sache pourquoi.
  if (rpps && !/^\d{9}$|^\d{11}$/.test(rpps.replace(/\s/g, ""))) {
    return {
      status: "error",
      message: "L'identifiant doit comporter 11 chiffres (RPPS) ou 9 (ADELI).",
    };
  }

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        await tx`
          update users set
            full_name = ${fullName},
            rpps = ${rpps.replace(/\s/g, "") || null},
            speciality_label = ${specialityLabel || null},
            updated_at = now()
          where id = ${session.user.id}
        `;
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: fullName,
          action: "user.profile_updated",
          objectType: "user",
          objectId: session.user.id,
          ip: client.ip,
          userAgent: client.userAgent,
        });
      },
    );
    return { status: "saved" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'enregistrement a échoué.",
    };
  }
}

// ---------------------------------------------------------------------------
// Image d'en-tête
// ---------------------------------------------------------------------------

export type LetterheadState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

/** Un en-tête de page A4 en 150 dpi tient largement dessous. */
const MAX_LETTERHEAD_BYTES = 2_000_000;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * L'image vit dans le magasin de documents, pas dans le `branding` jsonb.
 *
 * La fiche du cabinet est relue à presque chaque page ; y loger deux mégaoctets
 * de PNG ferait payer un en-tête à chaque affichage de tableau de bord.
 */
export async function saveLetterhead(
  _previous: LetterheadState,
  formData: FormData,
): Promise<LetterheadState> {
  const session = await requireSession();
  const client = await requestContext();

  const file = formData.get("letterheadImage");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choisissez une image." };
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { status: "error", message: "Formats acceptés : PNG, JPEG ou WebP." };
  }
  if (file.size > MAX_LETTERHEAD_BYTES) {
    return { status: "error", message: "Image trop lourde (2 Mo maximum)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        // Clé stable : remplacer l'en-tête écrase l'ancien plutôt que
        // d'accumuler des images orphelines que plus rien ne référence.
        const key = `${session.tenant.id}/branding/letterhead`;
        await documentStore(tx, session.tenant.id).put(key, bytes);

        const current = await getTenantSelf(tx);
        await updateTenantSelf(tx, {
          name: current.name,
          legalName: current.legalName,
          siret: current.siret,
          finess: current.finess,
          address: current.address,
          dpoContact: current.dpoContact,
          legalNotice: current.legalNotice,
          branding: {
            ...current.branding,
            letterheadMode: "image",
            letterheadImageKey: key,
            letterheadImageType: file.type,
          },
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "tenant.settings_updated",
          objectType: "tenant",
          objectId: session.tenant.id,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { letterhead: "image", bytes: bytes.byteLength },
        });
      },
    );

    return { status: "saved" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'envoi a échoué.",
    };
  }
}
