"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireCapability } from "@/lib/auth";
import { withTenant } from "@/lib/db";

/**
 * Effacement des données d'un patient — article 17 du RGPD.
 *
 * Le droit à l'effacement n'est pas absolu, et le prétendre serait mentir au
 * cabinet comme au patient. L'article 17.3 écarte la suppression lorsque la
 * conservation est nécessaire au respect d'une obligation légale ou à la
 * constatation d'un droit en justice — et c'est précisément le cas ici :
 *
 *  • le dossier médical se conserve, et un consentement signé est la pièce que
 *    le praticien devra produire si sa responsabilité est mise en cause. Le
 *    détruire à la demande reviendrait à détruire sa propre défense ;
 *  • le journal d'audit est chaîné : en retirer une entrée casserait la chaîne
 *    et rendrait invérifiables tous les consentements du cabinet.
 *
 * Ce que l'effacement fait donc réellement : il retire l'identité et les
 * coordonnées, qui ne sont couvertes par aucune obligation de conservation, et
 * laisse intacts les documents signés et leur faisceau de preuves. Le dossier
 * devient anonyme sans que la preuve disparaisse.
 *
 * La demande elle-même est journalisée : c'est ce qui permettra de démontrer
 * qu'elle a été traitée, et quand.
 */

export type ErasureState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "erased"; keptDocuments: number };

export async function erasePatientIdentity(
  _previous: ErasureState,
  formData: FormData,
): Promise<ErasureState> {
  const session = await requireCapability("patients.erase");
  const client = await requestContext();

  const patientId = String(formData.get("patientId") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (!patientId) return { status: "error", message: "Patient introuvable." };
  // Saisir « EFFACER » plutôt qu'une case à cocher : l'opération est
  // irréversible, et une case se coche par réflexe.
  if (confirmation !== "EFFACER") {
    return {
      status: "error",
      message: "Saisissez EFFACER en majuscules pour confirmer.",
    };
  }

  try {
    const kept = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const [patient] = await tx<{ first_name: string; last_name: string }[]>`
          select first_name, last_name from patients
          where id = ${patientId} and deleted_at is null
        `;
        if (!patient) throw new Error("Patient introuvable ou déjà effacé.");

        const [documents] = await tx<{ count: string }[]>`
          select count(*)::text as count
          from documents d
          join submissions s on s.id = d.submission_id
          where s.patient_id = ${patientId}
        `;

        await tx`
          update patients set
            first_name = 'Patient',
            last_name = 'effacé',
            birth_date = null,
            email = null,
            phone = null,
            notes = null,
            legal_representative = null,
            needs_legal_representative = false,
            external_ref = null,
            deleted_at = now(),
            updated_at = now()
          where id = ${patientId}
        `;

        // Les liens en cours n'ont plus lieu d'être : ils ouvriraient un
        // dossier dont l'identité vient d'être retirée.
        await tx`
          update access_tokens set revoked_at = now()
          where revoked_at is null
            and submission_id in (select id from submissions where patient_id = ${patientId})
        `;

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "patient.erased",
          objectType: "patient",
          objectId: patientId,
          ip: client.ip,
          userAgent: client.userAgent,
          // Ni le nom ni les coordonnées : les journaliser ici les conserverait
          // précisément là où on vient de les retirer.
          metadata: {
            documentsConserves: Number(documents?.count ?? 0),
            motif: "demande d'effacement (art. 17 RGPD)",
          },
        });

        return Number(documents?.count ?? 0);
      },
    );

    return { status: "erased", keptDocuments: kept };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'effacement a échoué.",
    };
  }
}
