"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { issueAccessToken } from "@/lib/magic-link";
import { patientInvitation, trySend } from "@/lib/notifications";
import { createQuoteSignature } from "@/lib/quote-signature";

/**
 * Import d'un devis produit par le logiciel métier du cabinet.
 *
 * Logos, VisioDent, Julie… établissent déjà le devis. Ce qui leur manque, ce
 * n'est pas un éditeur de plus, c'est de le faire signer avec une valeur
 * probante — quel document exact, lu combien de temps, accepté à quelle
 * seconde.
 *
 * Le PDF importé devient donc la pièce d'un dossier ordinaire : il traverse le
 * lien magique, la mesure du temps de lecture, les déclarations horodatées, la
 * chaîne d'audit et le faisceau de preuves, exactement comme un formulaire
 * Ryla. Rien de tout ça n'a besoin de savoir d'où vient la pièce.
 *
 * Le devis d'origine n'est jamais réécrit : il est scellé par son empreinte,
 * reproduit page pour page dans le document signé, et l'annexe de preuve porte
 * son SHA-256 — ce qui permet de démontrer plus tard que la pièce annexée est
 * bien celle qui a été affichée.
 */

export type ImportQuoteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "sent";
      submissionId: string;
      url: string;
      expiresAt: string;
      patientName: string;
      emailedTo: string | null;
      deliveryError: string | null;
    };

/** Au-delà, ce n'est plus un devis mais un dossier d'imagerie. */
const MAX_BYTES = 15_000_000;

export async function importQuoteForSignature(
  _previous: ImportQuoteState,
  formData: FormData,
): Promise<ImportQuoteState> {
  const session = await requireSession();
  const client = await requestContext();

  const patientId = String(formData.get("patientId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "dentaire");
  const source = String(formData.get("source") ?? "").trim() || null;
  const file = formData.get("document");

  if (!patientId) return { status: "error", message: "Choisissez un patient." };
  if (kind !== "dentaire" && kind !== "esthetique") {
    return { status: "error", message: "Régime de devis inconnu." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choisissez le PDF du devis." };
  }
  if (file.type !== "application/pdf") {
    return { status: "error", message: "Le devis doit être un PDF." };
  }
  if (file.size > MAX_BYTES) {
    return { status: "error", message: "Fichier trop lourd (15 Mo maximum)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Un PDF commence par %PDF- : un fichier renommé passerait le contrôle de
  // type MIME, qui est déclaratif, mais pas celui-ci.
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    return { status: "error", message: "Ce fichier n'est pas un PDF valide." };
  }

  const sha256 = sha256Hex(Buffer.from(bytes));
  const filename = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "devis.pdf";

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const [patient] = await tx<
          { first_name: string; last_name: string; email: string | null }[]
        >`
          select first_name, last_name, email
          from patients where id = ${patientId} and deleted_at is null
        `;
        if (!patient) throw new Error("Patient introuvable.");

        const submissionId = await createQuoteSignature(tx, {
          tenantId: session.tenant.id,
          userId: session.user.id,
          patientId,
          kind,
          filename,
          bytes,
          sha256,
          origin: "imported",
        });

        const token = await issueAccessToken(tx, {
          tenantId: session.tenant.id,
          tenantSlug: session.tenant.slug,
          submissionId,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "quote.imported",
          objectType: "submission",
          objectId: submissionId,
          ip: client.ip,
          userAgent: client.userAgent,
          // L'empreinte du fichier, jamais le jeton : le journal est
          // consultable depuis l'interface.
          metadata: { filename, sha256, source, kind, byteSize: bytes.byteLength },
        });

        return {
          submissionId,
          url: token.url,
          expiresAt: token.expiresAt,
          patientName: `${patient.first_name} ${patient.last_name}`,
          recipient: patient.email,
        };
      },
    );

    const delivery = result.recipient
      ? await trySend(
          patientInvitation({
            to: result.recipient,
            cabinetName: session.tenant.name,
            url: result.url,
            expiresAt: result.expiresAt,
          }),
        )
      : { sent: false, error: null };

    return {
      status: "sent",
      submissionId: result.submissionId,
      url: result.url,
      expiresAt: result.expiresAt.toISOString(),
      patientName: result.patientName,
      emailedTo: delivery.sent ? result.recipient : null,
      deliveryError: delivery.error,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'import a échoué.",
    };
  }
}
