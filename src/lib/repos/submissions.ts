import { canonicalHash, decryptJson, encryptJson } from "../crypto";
import type { Tx } from "../db";
import {
  parseFormDefinition,
  type Answers,
  type FormDefinition,
} from "../form-schema";
import { computeVigilance, type VigilanceSummary } from "../vigilance";
import { loadTenantDek } from "./tenant-key";

/**
 * Accès aux dossiers.
 *
 * Aucune requête de ce fichier ne filtre sur `tenant_id` : c'est le RLS qui
 * s'en charge, à partir du contexte posé par `withTenant()`. Si une requête
 * d'ici renvoie une ligne, c'est qu'elle appartient au cabinet courant.
 */

export type SubmissionStatus =
  | "draft"
  | "sent"
  | "in_progress"
  | "completed"
  | "signed"
  | "expired"
  | "revoked";

export type SubmissionRow = {
  id: string;
  tenantId: string;
  templateId: string;
  formVersionId: string;
  patientId: string | null;
  status: SubmissionStatus;
  locale: string;
  answersHash: string | null;
  vigilanceCount: number;
  vigilanceMaxLevel: "info" | "warning" | "critical" | null;
  sentAt: Date | null;
  firstOpenedAt: Date | null;
  completedAt: Date | null;
  signedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type SubmissionContext = SubmissionRow & {
  definition: FormDefinition;
  formVersion: number;
  formContentHash: string;
  templateKey: string;
  templateTitle: string;
  templateKind: "questionnaire" | "consentement" | "devis" | "droit_image";
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    email: string | null;
    phone: string | null;
    needsLegalRepresentative: boolean;
    legalRepresentative: Record<string, unknown> | null;
  } | null;
};

type SubmissionQueryRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  form_version_id: string;
  patient_id: string | null;
  status: SubmissionStatus;
  locale: string;
  answers_hash: string | null;
  vigilance_count: number;
  vigilance_max_level: SubmissionRow["vigilanceMaxLevel"];
  sent_at: Date | null;
  first_opened_at: Date | null;
  completed_at: Date | null;
  signed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  definition: unknown;
  form_version: number;
  form_content_hash: string;
  template_key: string;
  template_title: string;
  templateKind: SubmissionContext["templateKind"];
  p_id: string | null;
  p_first_name: string | null;
  p_last_name: string | null;
  p_birth_date: Date | null;
  p_email: string | null;
  p_phone: string | null;
  p_needs_rep: boolean | null;
  p_legal_rep: Record<string, unknown> | null;
};

function mapSubmission(row: SubmissionQueryRow): SubmissionContext {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    formVersionId: row.form_version_id,
    patientId: row.patient_id,
    status: row.status,
    locale: row.locale,
    answersHash: row.answers_hash,
    vigilanceCount: row.vigilance_count,
    vigilanceMaxLevel: row.vigilance_max_level,
    sentAt: row.sent_at,
    firstOpenedAt: row.first_opened_at,
    completedAt: row.completed_at,
    signedAt: row.signed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    definition: parseFormDefinition(row.definition),
    formVersion: row.form_version,
    formContentHash: row.form_content_hash,
    templateKey: row.template_key,
    templateTitle: row.template_title,
    templateKind: row.templateKind,
    patient: row.p_id
      ? {
          id: row.p_id,
          firstName: row.p_first_name ?? "",
          lastName: row.p_last_name ?? "",
          birthDate: row.p_birth_date,
          email: row.p_email,
          phone: row.p_phone,
          needsLegalRepresentative: row.p_needs_rep ?? false,
          legalRepresentative: row.p_legal_rep,
        }
      : null,
  };
}

const SUBMISSION_COLUMNS = `
  s.id, s.tenant_id, s.template_id, s.form_version_id, s.patient_id, s.status,
  s.locale, s.answers_hash, s.vigilance_count, s.vigilance_max_level,
  s.sent_at, s.first_opened_at, s.completed_at, s.signed_at, s.expires_at,
  s.created_at,
  v.definition, v.version as form_version, v.content_hash as form_content_hash,
  t.key as template_key, t.title as template_title, t.kind as "templateKind",
  p.id as p_id, p.first_name as p_first_name, p.last_name as p_last_name,
  p.birth_date as p_birth_date, p.email as p_email, p.phone as p_phone,
  p.needs_legal_representative as p_needs_rep,
  p.legal_representative as p_legal_rep
`;

export async function getSubmission(
  tx: Tx,
  submissionId: string,
): Promise<SubmissionContext | null> {
  const rows = await tx<SubmissionQueryRow[]>`
    select ${tx.unsafe(SUBMISSION_COLUMNS)}
    from submissions s
    join form_versions v on v.id = s.form_version_id
    join form_templates t on t.id = s.template_id
    left join patients p on p.id = s.patient_id
    where s.id = ${submissionId}
  `;
  const row = rows[0];
  return row ? mapSubmission(row) : null;
}

export type SubmissionListItem = {
  id: string;
  status: SubmissionStatus;
  templateTitle: string;
  templateKind: string;
  patientName: string | null;
  vigilanceCount: number;
  vigilanceMaxLevel: SubmissionRow["vigilanceMaxLevel"];
  sentAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
};

export async function listSubmissions(
  tx: Tx,
  options: { limit?: number } = {},
): Promise<SubmissionListItem[]> {
  const rows = await tx<
    {
      id: string;
      status: SubmissionStatus;
      template_title: string;
      template_kind: string;
      first_name: string | null;
      last_name: string | null;
      vigilance_count: number;
      vigilance_max_level: SubmissionRow["vigilanceMaxLevel"];
      sent_at: Date | null;
      signed_at: Date | null;
      created_at: Date;
    }[]
  >`
    select s.id, s.status, t.title as template_title, t.kind as template_kind,
           p.first_name, p.last_name, s.vigilance_count, s.vigilance_max_level,
           s.sent_at, s.signed_at, s.created_at
    from submissions s
    join form_templates t on t.id = s.template_id
    left join patients p on p.id = s.patient_id
    order by s.created_at desc
    limit ${options.limit ?? 100}
  `;

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    templateTitle: row.template_title,
    templateKind: row.template_kind,
    patientName:
      row.first_name || row.last_name
        ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
        : null,
    vigilanceCount: row.vigilance_count,
    vigilanceMaxLevel: row.vigilance_max_level,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Réponses chiffrées
// ---------------------------------------------------------------------------

export async function readAnswers(
  tx: Tx,
  tenantId: string,
  submissionId: string,
): Promise<Answers> {
  const [row] = await tx<
    {
      answers_enc: Uint8Array | null;
      answers_iv: Uint8Array | null;
      answers_tag: Uint8Array | null;
    }[]
  >`
    select answers_enc, answers_iv, answers_tag
    from submissions where id = ${submissionId}
  `;

  if (!row?.answers_enc || !row.answers_iv || !row.answers_tag) return {};

  const dek = await loadTenantDek(tx, tenantId);
  return decryptJson<Answers>(dek, {
    ciphertext: Buffer.from(row.answers_enc),
    iv: Buffer.from(row.answers_iv),
    tag: Buffer.from(row.answers_tag),
  });
}

export async function writeAnswers(
  tx: Tx,
  params: {
    tenantId: string;
    submissionId: string;
    definition: FormDefinition;
    answers: Answers;
    status?: SubmissionStatus;
  },
): Promise<{ answersHash: string; vigilance: VigilanceSummary }> {
  const dek = await loadTenantDek(tx, params.tenantId);
  const vigilance = computeVigilance(params.definition, params.answers);

  // Le détail des alertes est une donnée de santé : il part dans le blob
  // chiffré. Seuls le compteur et le niveau maximal restent en clair, pour
  // afficher « 3 alertes » en liste sans avoir à tout déchiffrer.
  const payload = { answers: params.answers, vigilance: vigilance.alerts };
  const blob = encryptJson(dek, payload);
  const answersHash = canonicalHash(params.answers);

  await tx`
    update submissions set
      answers_enc = ${blob.ciphertext},
      answers_iv = ${blob.iv},
      answers_tag = ${blob.tag},
      dek_version = (select dek_version from tenants where id = ${params.tenantId}),
      answers_hash = ${answersHash},
      vigilance_count = ${vigilance.count},
      vigilance_max_level = ${vigilance.maxLevel},
      status = coalesce(${params.status ?? null}, status)
    where id = ${params.submissionId}
  `;

  return { answersHash, vigilance };
}

/** Lit réponses + alertes déjà calculées, sans les recalculer. */
export async function readAnswersWithVigilance(
  tx: Tx,
  tenantId: string,
  submissionId: string,
): Promise<{ answers: Answers; alerts: VigilanceSummary["alerts"] }> {
  const [row] = await tx<
    {
      answers_enc: Uint8Array | null;
      answers_iv: Uint8Array | null;
      answers_tag: Uint8Array | null;
    }[]
  >`
    select answers_enc, answers_iv, answers_tag
    from submissions where id = ${submissionId}
  `;

  if (!row?.answers_enc || !row.answers_iv || !row.answers_tag) {
    return { answers: {}, alerts: [] };
  }

  const dek = await loadTenantDek(tx, tenantId);
  const payload = decryptJson<{
    answers: Answers;
    vigilance: VigilanceSummary["alerts"];
  }>(dek, {
    ciphertext: Buffer.from(row.answers_enc),
    iv: Buffer.from(row.answers_iv),
    tag: Buffer.from(row.answers_tag),
  });

  return { answers: payload.answers ?? {}, alerts: payload.vigilance ?? [] };
}

// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

export async function createSubmission(
  tx: Tx,
  params: {
    tenantId: string;
    templateId: string;
    formVersionId: string;
    patientId?: string | null;
    createdBy?: string | null;
    assignedTo?: string | null;
    locale?: string;
    expiresAt?: Date | null;
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into submissions (
      tenant_id, template_id, form_version_id, patient_id, created_by,
      assigned_to, locale, status, expires_at
    ) values (
      ${params.tenantId}, ${params.templateId}, ${params.formVersionId},
      ${params.patientId ?? null}, ${params.createdBy ?? null},
      ${params.assignedTo ?? null}, ${params.locale ?? "fr"}, 'draft',
      ${params.expiresAt ?? null}
    )
    returning id
  `;
  if (!row) throw new Error("Création du dossier impossible.");
  return row.id;
}

export async function markSent(tx: Tx, submissionId: string): Promise<void> {
  await tx`
    update submissions
    set status = 'sent', sent_at = coalesce(sent_at, now())
    where id = ${submissionId} and status = 'draft'
  `;
}

/**
 * Marque la première ouverture du lien par le patient.
 *
 * Renvoie `true` uniquement lors de la toute première ouverture — la clause
 * `first_opened_at is null` rend l'opération idempotente. Sans ça, chaque
 * rechargement de page ajouterait une entrée d'audit et l'horodatage
 * d'ouverture, qui compte dans le faisceau de preuves, glisserait.
 */
export async function markOpened(tx: Tx, submissionId: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    update submissions set
      first_opened_at = now(),
      status = case when status = 'sent' then 'in_progress' else status end
    where id = ${submissionId} and first_opened_at is null
    returning id
  `;
  return rows.length > 0;
}

export async function markCompleted(tx: Tx, submissionId: string): Promise<void> {
  await tx`
    update submissions
    set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = ${submissionId} and status in ('sent', 'in_progress')
  `;
}

export async function markSigned(tx: Tx, submissionId: string): Promise<void> {
  await tx`
    update submissions
    set status = 'signed', signed_at = coalesce(signed_at, now()),
        completed_at = coalesce(completed_at, now())
    where id = ${submissionId}
  `;
}
