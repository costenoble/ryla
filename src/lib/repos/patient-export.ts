import type { Tx } from "../db";
import { getPatient } from "./patients";
import { listQuotesForPatient } from "./quotes";
import { readAnswersWithVigilance } from "./submissions";

/**
 * Export des données d'un patient — article 20 du RGPD.
 *
 * Le droit à la portabilité veut un format « structuré, couramment utilisé et
 * lisible par machine » : c'est du JSON, pas un PDF de courtoisie. Il doit
 * contenir ce que le cabinet détient réellement, réponses de santé comprises,
 * et pas seulement l'état civil.
 *
 * Les documents signés sont listés avec leur empreinte plutôt qu'incorporés :
 * ils se téléchargent un par un et pèsent trop pour tenir dans un JSON. Leur
 * SHA-256 permet malgré tout de vérifier que le fichier remis est bien celui
 * que l'export annonce.
 */

export type PatientExport = {
  exportedAt: string;
  cabinet: string;
  patient: Record<string, unknown>;
  submissions: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
  imageRightsConsents: Record<string, unknown>[];
  /** Accès à ce dossier, tels que journalisés. */
  accessLog: Record<string, unknown>[];
};

export async function buildPatientExport(
  tx: Tx,
  tenantId: string,
  tenantName: string,
  patientId: string,
): Promise<PatientExport | null> {
  const patient = await getPatient(tx, patientId);
  if (!patient) return null;

  const submissionRows = await tx<
    {
      id: string;
      status: string;
      template_title: string;
      form_version: number;
      content_hash: string;
      sent_at: Date | null;
      first_opened_at: Date | null;
      signed_at: Date | null;
      created_at: Date;
    }[]
  >`
    select s.id, s.status, t.title as template_title, v.version as form_version,
           v.content_hash, s.sent_at, s.first_opened_at, s.signed_at, s.created_at
    from submissions s
    join form_templates t on t.id = s.template_id
    join form_versions v on v.id = s.form_version_id
    where s.patient_id = ${patientId}
    order by s.created_at
  `;

  const submissions: Record<string, unknown>[] = [];
  for (const row of submissionRows) {
    // Les réponses sont déchiffrées ici : c'est bien le contenu que le patient
    // a le droit de récupérer, pas une liste de dossiers vides.
    const { answers, alerts } = await readAnswersWithVigilance(tx, tenantId, row.id);

    const documents = await tx<
      { filename: string; sha256: string; byte_size: number | null; created_at: Date }[]
    >`
      select filename, sha256, byte_size, created_at
      from documents where submission_id = ${row.id} order by created_at
    `;

    const signatures = await tx<
      { signer_name: string; level: string; signed_at: Date; document_hash: string }[]
    >`
      select signer_name, level, signed_at, document_hash
      from signatures where submission_id = ${row.id} order by signed_at
    `;

    submissions.push({
      id: row.id,
      document: row.template_title,
      statut: row.status,
      versionDuFormulaire: row.form_version,
      empreinteDuTexteAffiche: row.content_hash,
      envoyeLe: row.sent_at,
      ouvertLe: row.first_opened_at,
      signeLe: row.signed_at,
      creeLe: row.created_at,
      reponses: answers,
      pointsDeVigilance: alerts,
      signatures,
      documents,
    });
  }

  const quotes = (await listQuotesForPatient(tx, patientId)).map((quote) => ({
    reference: quote.reference,
    nature: quote.kind,
    statut: quote.status,
    totalCentimes: quote.totalAmountCents,
    resteAChargeCentimes: quote.remainingChargeCents,
    delaiDeReflexionJours: quote.reflectionPeriodDays,
    remisLe: quote.reflectionStartsAt,
    accepteLe: quote.acceptedAt,
    reglement: {
      statut: quote.paymentStatus,
      montantCentimes: quote.paidAmountCents,
      le: quote.paidAt,
    },
  }));

  const consents = await tx<
    { scope: string; granted: boolean; granted_at: Date | null; revoked_at: Date | null }[]
  >`
    select scope, granted, granted_at, revoked_at
    from image_rights_consents where patient_id = ${patientId} order by scope
  `;

  const accessLog = await tx<
    { occurred_at: Date; action: string; actor_label: string | null; actor_type: string }[]
  >`
    select a.occurred_at, a.action, a.actor_label, a.actor_type
    from audit_log a
    where a.object_id = ${patientId}
       or a.object_id in (select id from submissions where patient_id = ${patientId})
    order by a.occurred_at
  `;

  return {
    exportedAt: new Date().toISOString(),
    cabinet: tenantName,
    patient: {
      id: patient.id,
      nom: patient.lastName,
      prenom: patient.firstName,
      dateDeNaissance: patient.birthDate,
      email: patient.email,
      telephone: patient.phone,
      representantLegal: patient.legalRepresentative,
      notesInternes: patient.notes,
      creeLe: patient.createdAt,
    },
    submissions,
    quotes,
    imageRightsConsents: consents,
    accessLog,
  };
}
