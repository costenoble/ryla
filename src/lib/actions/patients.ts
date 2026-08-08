"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import {
  createPatient,
  getPatient,
  updatePatient,
  type PatientInput,
} from "@/lib/repos/patients";
import { setQuotePayment, type PaymentStatus } from "@/lib/repos/quotes";

/**
 * Écritures sur les patients.
 *
 * Pas de `revalidatePath()` ici : les pages praticien sont en `force-dynamic`
 * et relisent la base à chaque navigation. L'appel serait sans effet utile, et
 * il régénérerait en arrière-plan une page protégée par le layout — hors du
 * contexte de cookies, donc avec une redirection vers /connexion qui écraserait
 * la réponse de l'action. C'est un piège dans lequel on est déjà tombé.
 */

export type PatientFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; patientId: string };

function readForm(formData: FormData): PatientInput & { valid: boolean; error?: string } {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const needsRep = formData.get("needsLegalRepresentative") === "on";

  const repName = String(formData.get("repFullName") ?? "").trim();
  const repRelationship = String(formData.get("repRelationship") ?? "").trim();
  const repEmail = String(formData.get("repEmail") ?? "").trim();
  const repPhone = String(formData.get("repPhone") ?? "").trim();

  const base = {
    firstName,
    lastName,
    birthDate: birthDate || null,
    email: email || null,
    phone: phone || null,
    notes: notes || null,
    needsLegalRepresentative: needsRep,
    legalRepresentative: needsRep
      ? {
          fullName: repName || undefined,
          relationship: repRelationship || undefined,
          email: repEmail || undefined,
          phone: repPhone || undefined,
        }
      : null,
  };

  if (!firstName || !lastName) {
    return { ...base, valid: false, error: "Le nom et le prénom sont obligatoires." };
  }
  // Un représentant légal sans nom ne protège personne : autant le refuser à
  // la saisie plutôt que de découvrir le trou au moment de faire signer.
  if (needsRep && !repName) {
    return {
      ...base,
      valid: false,
      error: "Indiquez le nom du représentant légal.",
    };
  }
  return { ...base, valid: true };
}

export async function savePatient(
  _previous: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const session = await requireSession();
  const client = await requestContext();
  const patientId = String(formData.get("patientId") ?? "").trim() || null;

  const input = readForm(formData);
  if (!input.valid) return { status: "error", message: input.error! };

  try {
    const id = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        if (patientId) {
          await updatePatient(tx, patientId, input);
          await recordAudit(tx, session.tenant.id, {
            actorType: "user",
            actorId: session.user.id,
            actorLabel: session.user.fullName,
            action: "patient.updated",
            objectType: "patient",
            objectId: patientId,
            ip: client.ip,
            userAgent: client.userAgent,
          });
          return patientId;
        }

        const created = await createPatient(tx, session.tenant.id, input);
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "patient.created",
          objectType: "patient",
          objectId: created,
          ip: client.ip,
          userAgent: client.userAgent,
        });
        return created;
      },
    );

    return { status: "saved", patientId: id };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'enregistrement a échoué.",
    };
  }
}

// ---------------------------------------------------------------------------
// Règlements
// ---------------------------------------------------------------------------

export type PaymentFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

export async function saveQuotePayment(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const session = await requireSession();
  const client = await requestContext();

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const status = String(formData.get("paymentStatus") ?? "unpaid") as PaymentStatus;
  const amountEuros = String(formData.get("paidAmount") ?? "0").replace(",", ".");
  const note = String(formData.get("paymentNote") ?? "").trim();

  if (!quoteId) return { status: "error", message: "Devis introuvable." };
  if (!["unpaid", "partial", "paid", "waived"].includes(status)) {
    return { status: "error", message: "Statut de règlement invalide." };
  }

  const parsed = Number(amountEuros);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { status: "error", message: "Montant invalide." };
  }

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        await setQuotePayment(tx, quoteId, {
          status,
          paidAmountCents: Math.round(parsed * 100),
          note,
        });
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "quote.payment_updated",
          objectType: "quote",
          objectId: quoteId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { status, amountCents: Math.round(parsed * 100) },
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

export async function loadPatient(patientId: string) {
  const session = await requireSession();
  return withTenant({ tenantId: session.tenant.id }, (tx) => getPatient(tx, patientId));
}
