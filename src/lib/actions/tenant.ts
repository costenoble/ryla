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
          letterheadText: String(formData.get("letterheadText") ?? "").trim() || undefined,
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
