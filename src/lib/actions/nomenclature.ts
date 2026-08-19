"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { CARE_BASKETS } from "@/lib/cerfa";
import { withTenant } from "@/lib/db";

/**
 * Gestion du référentiel d'actes par le cabinet.
 *
 * La référence partagée — CCAM, NGAP — n'est jamais modifiée : c'est un texte
 * réglementaire, et l'écraser pour un cabinet la casserait pour tous les
 * autres. Corriger un acte partagé en crée donc une copie qui appartient au
 * cabinet, et c'est elle qui prime ensuite à la recherche. La référence reste
 * intacte, ce qui est la seule façon de pouvoir la mettre à jour plus tard sans
 * détruire le travail de chacun.
 *
 * Les politiques RLS de la migration 0009 rendent cette règle inviolable : une
 * écriture sur une ligne partagée ne passe pas, quel que soit le chemin
 * applicatif emprunté.
 */

export type ActState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; entryId: string }
  | { status: "deleted" };

const SYSTEMS = ["CCAM", "NGAP", "HORS_NOMENCLATURE"] as const;
const SPECIALTIES = ["dentaire", "esthetique", "commun"] as const;

/** Euros saisis → centimes. Vide reste vide : un tarif inconnu n'est pas zéro. */
function cents(value: string): number | null {
  const trimmed = value.replace(",", ".").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export async function saveNomenclatureEntry(
  _previous: ActState,
  formData: FormData,
): Promise<ActState> {
  const session = await requireSession();
  const client = await requestContext();

  const entryId = String(formData.get("entryId") ?? "").trim() || null;
  const system = String(formData.get("system") ?? "CCAM");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  const shortLabel = String(formData.get("shortLabel") ?? "").trim() || null;
  const specialty = String(formData.get("specialty") ?? "commun");
  const category = String(formData.get("category") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const careBasket = String(formData.get("careBasket") ?? "").trim() || null;
  const reimbursable = formData.get("reimbursable") === "on";

  const base = cents(String(formData.get("base") ?? ""));
  const ceiling = cents(String(formData.get("ceiling") ?? ""));
  const rate = Number(String(formData.get("rate") ?? "0.7").replace(",", "."));
  const coefficient = String(formData.get("coefficient") ?? "").trim();

  if (!(SYSTEMS as readonly string[]).includes(system)) {
    return { status: "error", message: "Système inconnu." };
  }
  if (!(SPECIALTIES as readonly string[]).includes(specialty)) {
    return { status: "error", message: "Spécialité inconnue." };
  }
  if (!code) return { status: "error", message: "Le code est obligatoire." };
  if (!label) return { status: "error", message: "Le libellé est obligatoire." };
  if (careBasket && !(CARE_BASKETS as readonly string[]).includes(careBasket)) {
    return { status: "error", message: "Panier de soins inconnu." };
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return { status: "error", message: "Le taux doit être compris entre 0 et 1." };
  }

  try {
    const id = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const values = {
          system,
          code,
          label,
          shortLabel,
          specialty,
          category,
          base,
          ceiling,
          rate,
          careBasket,
          reimbursable,
          coefficient: coefficient === "" ? null : Number(coefficient),
          notes,
        };

        if (entryId) {
          // Le `where tenant_id = …` est redondant avec la politique RLS de
          // mise à jour, et c'est volontaire : il rend l'intention lisible à
          // qui relit la requête sans connaître les politiques.
          const rows = await tx<{ id: string }[]>`
            update nomenclature set
              system = ${values.system}, code = ${values.code},
              label = ${values.label}, short_label = ${values.shortLabel},
              specialty = ${values.specialty}, category = ${values.category},
              base_reimbursement_cents = ${values.base},
              ceiling_cents = ${values.ceiling},
              reimbursement_rate = ${values.rate},
              care_basket = ${values.careBasket},
              reimbursable = ${values.reimbursable},
              ngap_coefficient = ${values.coefficient},
              notes = ${values.notes},
              -- Un acte relu et corrigé par le praticien ne porte plus de doute :
              -- c'est lui qui fait autorité sur ses propres tarifs.
              needs_review = false,
              source = ${`Saisi par ${session.user.fullName}`},
              updated_at = now()
            where id = ${entryId} and tenant_id = ${session.tenant.id}
            returning id
          `;
          if (!rows[0]) {
            throw new Error(
              "Cet acte appartient au référentiel partagé : dupliquez-le pour le corriger.",
            );
          }
          return rows[0].id;
        }

        const [created] = await tx<{ id: string }[]>`
          insert into nomenclature (
            tenant_id, system, code, label, short_label, specialty, category,
            base_reimbursement_cents, ceiling_cents, reimbursement_rate,
            care_basket, reimbursable, ngap_coefficient, notes, source,
            needs_review
          ) values (
            ${session.tenant.id}, ${values.system}, ${values.code}, ${values.label},
            ${values.shortLabel}, ${values.specialty}, ${values.category},
            ${values.base}, ${values.ceiling}, ${values.rate}, ${values.careBasket},
            ${values.reimbursable}, ${values.coefficient}, ${values.notes},
            ${`Saisi par ${session.user.fullName}`}, false
          )
          returning id
        `;
        if (!created) throw new Error("Création impossible.");
        return created.id;
      },
    );

    await withTenant({ tenantId: session.tenant.id, actorId: session.user.id }, (tx) =>
      recordAudit(tx, session.tenant.id, {
        actorType: "user",
        actorId: session.user.id,
        actorLabel: session.user.fullName,
        action: entryId ? "nomenclature.updated" : "nomenclature.created",
        objectType: "nomenclature",
        objectId: id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { system, code },
      }),
    );

    return { status: "saved", entryId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "L'enregistrement a échoué.";
    // Le doublon est l'erreur la plus courante, et son message brut est
    // illisible pour un praticien.
    if (message.includes("nomenclature_tenant_code_idx")) {
      return {
        status: "error",
        message: `Vous avez déjà un acte ${system} portant le code ${code}.`,
      };
    }
    return { status: "error", message };
  }
}

export async function deleteNomenclatureEntry(
  _previous: ActState,
  formData: FormData,
): Promise<ActState> {
  const session = await requireSession();
  const client = await requestContext();
  const entryId = String(formData.get("entryId") ?? "").trim();
  if (!entryId) return { status: "error", message: "Acte introuvable." };

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const rows = await tx<{ code: string }[]>`
          delete from nomenclature
          where id = ${entryId} and tenant_id = ${session.tenant.id}
          returning code
        `;
        if (!rows[0]) {
          throw new Error(
            "Cet acte fait partie du référentiel partagé et ne peut pas être supprimé.",
          );
        }

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "nomenclature.deleted",
          objectType: "nomenclature",
          objectId: entryId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { code: rows[0].code },
        });
      },
    );
    return { status: "deleted" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "La suppression a échoué.",
    };
  }
}
