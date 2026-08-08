import type { Tx } from "../db";

/**
 * Accès aux patients.
 *
 * C'est l'entrée principale du cabinet : on pense « Julien Bertrand », pas
 * « dossier 58dffb6c ». Les documents et les devis se lisent depuis la fiche
 * du patient, jamais l'inverse.
 *
 * Aucune requête ne filtre sur `tenant_id` : le RLS s'en charge à partir du
 * contexte posé par `withTenant()`.
 */

export type PatientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  documentCount: number;
  pendingCount: number;
  signedCount: number;
  /** Somme des alertes déclarées sur ses documents — compteur en clair. */
  vigilanceCount: number;
  hasCritical: boolean;
  lastActivityAt: Date | null;
  outstandingCents: number;
};

export type PatientFilter = "all" | "pending" | "vigilance" | "unpaid";

/**
 * Liste des patients, avec ce qu'il faut pour décider quoi faire ensuite.
 *
 * Les compteurs sont agrégés en base plutôt qu'en JavaScript : à cinq cents
 * patients, remonter tous les documents pour les compter côté application
 * devient absurde.
 */
export async function listPatients(
  tx: Tx,
  options: { search?: string; filter?: PatientFilter; limit?: number } = {},
): Promise<PatientListItem[]> {
  const search = options.search?.trim() ?? "";
  const filter = options.filter ?? "all";

  const rows = await tx<
    {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: Date | null;
      email: string | null;
      phone: string | null;
      document_count: string;
      pending_count: string;
      signed_count: string;
      vigilance_count: string;
      has_critical: boolean;
      last_activity_at: Date | null;
      outstanding_cents: string;
    }[]
  >`
    with docs as (
      select
        patient_id,
        count(*)                                                   as document_count,
        count(*) filter (where status in ('sent', 'in_progress'))  as pending_count,
        count(*) filter (where status = 'signed')                  as signed_count,
        coalesce(sum(vigilance_count), 0)                          as vigilance_count,
        bool_or(vigilance_max_level = 'critical')                  as has_critical,
        max(greatest(
          coalesce(signed_at, to_timestamp(0)),
          coalesce(sent_at, to_timestamp(0)),
          created_at
        ))                                                         as last_activity_at
      from submissions
      where patient_id is not null
      group by patient_id
    ),
    money as (
      select
        patient_id,
        coalesce(sum(remaining_charge_cents - paid_amount_cents), 0) as outstanding_cents
      from quotes
      where patient_id is not null
        and status in ('sent', 'accepted')
        and payment_status <> 'waived'
      group by patient_id
    )
    select
      p.id, p.first_name, p.last_name, p.birth_date, p.email, p.phone,
      coalesce(d.document_count, 0)::text  as document_count,
      coalesce(d.pending_count, 0)::text   as pending_count,
      coalesce(d.signed_count, 0)::text    as signed_count,
      coalesce(d.vigilance_count, 0)::text as vigilance_count,
      coalesce(d.has_critical, false)      as has_critical,
      d.last_activity_at,
      greatest(coalesce(m.outstanding_cents, 0), 0)::text as outstanding_cents
    from patients p
    left join docs d  on d.patient_id = p.id
    left join money m on m.patient_id = p.id
    where p.deleted_at is null
      and (
        ${search} = ''
        or p.first_name ilike ${"%" + search + "%"}
        or p.last_name  ilike ${"%" + search + "%"}
        or p.email      ilike ${"%" + search + "%"}
      )
      and (
        ${filter} = 'all'
        or (${filter} = 'pending'   and coalesce(d.pending_count, 0) > 0)
        or (${filter} = 'vigilance' and coalesce(d.has_critical, false))
        or (${filter} = 'unpaid'    and coalesce(m.outstanding_cents, 0) > 0)
      )
    order by coalesce(d.last_activity_at, p.created_at) desc
    limit ${options.limit ?? 200}
  `;

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    email: row.email,
    phone: row.phone,
    documentCount: Number(row.document_count),
    pendingCount: Number(row.pending_count),
    signedCount: Number(row.signed_count),
    vigilanceCount: Number(row.vigilance_count),
    hasCritical: row.has_critical,
    lastActivityAt: row.last_activity_at,
    outstandingCents: Number(row.outstanding_cents),
  }));
}

export type PatientRecord = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  needsLegalRepresentative: boolean;
  legalRepresentative: {
    fullName?: string;
    relationship?: string;
    email?: string;
    phone?: string;
  } | null;
  notes: string | null;
  createdAt: Date;
};

export async function getPatient(
  tx: Tx,
  patientId: string,
): Promise<PatientRecord | null> {
  const [row] = await tx<
    {
      id: string;
      first_name: string;
      last_name: string;
      birth_date: Date | null;
      email: string | null;
      phone: string | null;
      needs_legal_representative: boolean;
      legal_representative: PatientRecord["legalRepresentative"];
      notes: string | null;
      created_at: Date;
    }[]
  >`
    select id, first_name, last_name, birth_date, email, phone,
           needs_legal_representative, legal_representative, notes, created_at
    from patients
    where id = ${patientId} and deleted_at is null
  `;

  if (!row) return null;

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    email: row.email,
    phone: row.phone,
    needsLegalRepresentative: row.needs_legal_representative,
    legalRepresentative: row.legal_representative,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export type PatientDocument = {
  id: string;
  templateTitle: string;
  templateKind: string;
  status: string;
  vigilanceCount: number;
  vigilanceMaxLevel: "info" | "warning" | "critical" | null;
  sentAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
  pdfDocumentId: string | null;
};

/** Documents d'un patient, du plus récent au plus ancien. */
export async function listPatientDocuments(
  tx: Tx,
  patientId: string,
): Promise<PatientDocument[]> {
  const rows = await tx<
    {
      id: string;
      template_title: string;
      template_kind: string;
      status: string;
      vigilance_count: number;
      vigilance_max_level: PatientDocument["vigilanceMaxLevel"];
      sent_at: Date | null;
      signed_at: Date | null;
      created_at: Date;
      pdf_document_id: string | null;
    }[]
  >`
    select s.id, t.title as template_title, t.kind as template_kind, s.status,
           s.vigilance_count, s.vigilance_max_level, s.sent_at, s.signed_at,
           s.created_at,
           (select d.id from documents d
             where d.submission_id = s.id
             order by d.created_at desc limit 1) as pdf_document_id
    from submissions s
    join form_templates t on t.id = s.template_id
    where s.patient_id = ${patientId}
    order by s.created_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    templateTitle: row.template_title,
    templateKind: row.template_kind,
    status: row.status,
    vigilanceCount: row.vigilance_count,
    vigilanceMaxLevel: row.vigilance_max_level,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    createdAt: row.created_at,
    pdfDocumentId: row.pdf_document_id,
  }));
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export type PatientInput = {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  needsLegalRepresentative?: boolean;
  legalRepresentative?: PatientRecord["legalRepresentative"];
  notes?: string | null;
};

export async function createPatient(
  tx: Tx,
  tenantId: string,
  input: PatientInput,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into patients (
      tenant_id, first_name, last_name, birth_date, email, phone,
      needs_legal_representative, legal_representative, notes
    ) values (
      ${tenantId}, ${input.firstName}, ${input.lastName},
      ${input.birthDate || null}, ${input.email || null}, ${input.phone || null},
      ${input.needsLegalRepresentative ?? false},
      ${input.legalRepresentative ? tx.json(input.legalRepresentative as never) : null},
      ${input.notes || null}
    )
    returning id
  `;
  if (!row) throw new Error("Création du patient impossible.");
  return row.id;
}

export async function updatePatient(
  tx: Tx,
  patientId: string,
  input: PatientInput,
): Promise<void> {
  await tx`
    update patients set
      first_name = ${input.firstName},
      last_name = ${input.lastName},
      birth_date = ${input.birthDate || null},
      email = ${input.email || null},
      phone = ${input.phone || null},
      needs_legal_representative = ${input.needsLegalRepresentative ?? false},
      legal_representative = ${
        input.legalRepresentative ? tx.json(input.legalRepresentative as never) : null
      },
      notes = ${input.notes || null}
    where id = ${patientId} and deleted_at is null
  `;
}

/**
 * Retrouve un patient existant sur nom + prénom + date de naissance.
 *
 * Suffisant pour une saisie au comptoir, et surtout : évite de créer un
 * doublon à chaque envoi de document au même patient.
 */
export async function findMatchingPatient(
  tx: Tx,
  input: { firstName: string; lastName: string; birthDate?: string | null },
): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    select id from patients
    where lower(last_name) = lower(${input.lastName})
      and lower(first_name) = lower(${input.firstName})
      and (${input.birthDate || null}::date is null
           or birth_date is null
           or birth_date = ${input.birthDate || null}::date)
      and deleted_at is null
    limit 1
  `;
  return row?.id ?? null;
}
