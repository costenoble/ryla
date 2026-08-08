import {
  computeQuoteTotals,
  type CareBasket,
  type QuoteLineInput,
} from "../cerfa";
import type { Tx } from "../db";
import { checkAcceptanceAllowed, computeReflectionWindow } from "../reflection";

/**
 * Devis.
 *
 * Deux natures, deux régimes :
 *  • `dentaire_cerfa_s3404` : devis conventionnel obligatoire, mentions
 *    verrouillées, calcul du reste à charge.
 *  • `esthetique` : devis obligatoire assorti d'un délai de réflexion de
 *    quinze jours (art. D6322-30 CSP).
 *
 * Le délai de réflexion n'est pas un champ que l'interface pilote : il démarre
 * à la remise du devis et sa vérification est faite ici, côté serveur, avant
 * toute acceptation.
 */

export type QuoteKind = "dentaire_cerfa_s3404" | "esthetique";
export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "refused"
  | "expired"
  | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "waived";

export type QuoteRecord = {
  id: string;
  kind: QuoteKind;
  reference: string;
  status: QuoteStatus;
  paymentStatus: PaymentStatus;
  paidAmountCents: number;
  paidAt: Date | null;
  paymentNote: string | null;
  totalAmountCents: number;
  totalAmoCents: number;
  totalAmcCents: number;
  remainingChargeCents: number;
  validityDays: number;
  reflectionPeriodDays: number;
  reflectionStartsAt: Date | null;
  reflectionEndsAt: Date | null;
  acceptedAt: Date | null;
  payload: Record<string, unknown>;
  patientId: string | null;
  createdAt: Date;
};

type QuoteRow = {
  id: string;
  kind: QuoteKind;
  reference: string;
  status: QuoteStatus;
  total_amount_cents: string | number;
  total_amo_cents: string | number;
  total_amc_cents: string | number;
  remaining_charge_cents: string | number;
  validity_days: number;
  reflection_period_days: number;
  reflection_starts_at: Date | null;
  reflection_ends_at: Date | null;
  accepted_at: Date | null;
  payload: Record<string, unknown>;
  patient_id: string | null;
  created_at: Date;
  payment_status: PaymentStatus;
  paid_amount_cents: string | number;
  paid_at: Date | null;
  payment_note: string | null;
};

// bigint revient en chaîne depuis Postgres : les centimes restent bien en deçà
// de Number.MAX_SAFE_INTEGER, la conversion est sûre.
function mapQuote(row: QuoteRow): QuoteRecord {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    status: row.status,
    totalAmountCents: Number(row.total_amount_cents),
    totalAmoCents: Number(row.total_amo_cents),
    totalAmcCents: Number(row.total_amc_cents),
    remainingChargeCents: Number(row.remaining_charge_cents),
    validityDays: row.validity_days,
    reflectionPeriodDays: row.reflection_period_days,
    reflectionStartsAt: row.reflection_starts_at,
    reflectionEndsAt: row.reflection_ends_at,
    acceptedAt: row.accepted_at,
    payload: row.payload ?? {},
    patientId: row.patient_id,
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
    paidAmountCents: Number(row.paid_amount_cents),
    paidAt: row.paid_at,
    paymentNote: row.payment_note,
  };
}

const QUOTE_COLUMNS = `
  id, kind, reference, status, total_amount_cents, total_amo_cents,
  total_amc_cents, remaining_charge_cents, validity_days,
  reflection_period_days, reflection_starts_at, reflection_ends_at,
  accepted_at, payload, patient_id, created_at,
  payment_status, paid_amount_cents, paid_at, payment_note
`;

export async function createQuote(
  tx: Tx,
  params: {
    tenantId: string;
    kind: QuoteKind;
    reference: string;
    lines: QuoteLineInput[];
    patientId?: string | null;
    submissionId?: string | null;
    practitionerId?: string | null;
    validityDays?: number;
    reflectionPeriodDays?: number;
    payload?: Record<string, unknown>;
    importSource?: "manual" | "email" | "print" | "api";
  },
): Promise<{ quoteId: string; remainingChargeCents: number }> {
  const totals = computeQuoteTotals(params.lines);

  const [quote] = await tx<{ id: string }[]>`
    insert into quotes (
      tenant_id, patient_id, submission_id, practitioner_id, kind, reference,
      status, total_amount_cents, total_amo_cents, total_amc_cents,
      remaining_charge_cents, validity_days, reflection_period_days,
      payload, import_source
    ) values (
      ${params.tenantId}, ${params.patientId ?? null}, ${params.submissionId ?? null},
      ${params.practitionerId ?? null}, ${params.kind}, ${params.reference},
      'draft', ${totals.totalAmountCents}, ${totals.totalAmoCents},
      ${totals.totalAmcCents}, ${totals.remainingChargeCents},
      ${params.validityDays ?? 30}, ${params.reflectionPeriodDays ?? 0},
      ${tx.json((params.payload ?? {}) as never)}, ${params.importSource ?? "manual"}
    )
    returning id
  `;
  if (!quote) throw new Error("Création du devis impossible.");

  let position = 0;
  for (const line of totals.lines) {
    await tx`
      insert into quote_lines (
        tenant_id, quote_id, position, ccam_code, tooth_numbers, description,
        care_basket, material, quantity, unit_price_cents,
        base_reimbursement_cents, reimbursement_rate, amo_cents, amc_cents,
        patient_cents
      ) values (
        ${params.tenantId}, ${quote.id}, ${position}, ${line.ccamCode ?? null},
        ${line.toothNumbers ?? null}, ${line.description},
        ${(line.careBasket ?? null) as CareBasket | null}, ${line.material ?? null},
        ${line.quantity}, ${line.unitPriceCents}, ${line.baseReimbursementCents},
        ${line.reimbursementRate}, ${line.amoCents}, ${line.amcCents},
        ${line.patientCents}
      )
    `;
    position += 1;
  }

  return { quoteId: quote.id, remainingChargeCents: totals.remainingChargeCents };
}

export async function getQuote(tx: Tx, quoteId: string): Promise<QuoteRecord | null> {
  const rows = await tx<QuoteRow[]>`
    select ${tx.unsafe(QUOTE_COLUMNS)} from quotes where id = ${quoteId}
  `;
  const row = rows[0];
  return row ? mapQuote(row) : null;
}

export async function listQuotes(tx: Tx, limit = 100): Promise<QuoteRecord[]> {
  const rows = await tx<QuoteRow[]>`
    select ${tx.unsafe(QUOTE_COLUMNS)} from quotes
    order by created_at desc limit ${limit}
  `;
  return rows.map(mapQuote);
}

export async function getQuoteLines(tx: Tx, quoteId: string) {
  return tx<
    {
      position: number;
      ccam_code: string | null;
      tooth_numbers: string[] | null;
      description: string;
      care_basket: CareBasket | null;
      material: string | null;
      quantity: number;
      unit_price_cents: string;
      base_reimbursement_cents: string;
      amo_cents: string;
      amc_cents: string;
      patient_cents: string;
    }[]
  >`
    select position, ccam_code, tooth_numbers, description, care_basket,
           material, quantity, unit_price_cents, base_reimbursement_cents,
           amo_cents, amc_cents, patient_cents
    from quote_lines
    where quote_id = ${quoteId}
    order by position
  `;
}

/**
 * Remise du devis au patient — c'est cet instant qui fait courir le délai.
 *
 * L'horodatage est posé par la base (`now()`), pas par le client : il doit
 * rester incontestable, y compris face au praticien lui-même.
 */
export async function deliverQuote(tx: Tx, quoteId: string): Promise<QuoteRecord> {
  const [row] = await tx<QuoteRow[]>`
    update quotes set
      status = 'sent',
      reflection_starts_at = coalesce(reflection_starts_at, now()),
      reflection_ends_at = case
        when reflection_period_days > 0
        then coalesce(reflection_starts_at, now()) + (reflection_period_days || ' days')::interval
        else null
      end
    where id = ${quoteId} and status = 'draft'
    returning ${tx.unsafe(QUOTE_COLUMNS)}
  `;
  if (!row) throw new Error("Devis introuvable ou déjà remis.");
  return mapQuote(row);
}

export type QuoteAcceptance =
  | { accepted: true; quote: QuoteRecord }
  | { accepted: false; reason: string; availableAt: Date | null };

export async function acceptQuote(
  tx: Tx,
  quoteId: string,
  now = new Date(),
): Promise<QuoteAcceptance> {
  const quote = await getQuote(tx, quoteId);
  if (!quote) {
    return { accepted: false, reason: "Devis introuvable.", availableAt: null };
  }
  if (quote.status === "accepted") {
    return { accepted: true, quote };
  }
  if (quote.status !== "sent") {
    return {
      accepted: false,
      reason: "Le devis n'a pas encore été remis au patient.",
      availableAt: null,
    };
  }

  const check = checkAcceptanceAllowed({
    days: quote.reflectionPeriodDays,
    startsAt: quote.reflectionStartsAt,
    now,
  });
  if (!check.allowed) {
    return { accepted: false, reason: check.reason, availableAt: check.availableAt };
  }

  const [row] = await tx<QuoteRow[]>`
    update quotes set status = 'accepted', accepted_at = now()
    where id = ${quoteId}
    returning ${tx.unsafe(QUOTE_COLUMNS)}
  `;
  if (!row) throw new Error("Acceptation du devis impossible.");
  return { accepted: true, quote: mapQuote(row) };
}

export function quoteReflectionStatus(quote: QuoteRecord, now = new Date()) {
  return computeReflectionWindow({
    days: quote.reflectionPeriodDays,
    startsAt: quote.reflectionStartsAt,
    now,
  });
}


/**
 * Devis d'un patient, pour sa fiche.
 */
export async function listQuotesForPatient(
  tx: Tx,
  patientId: string,
): Promise<QuoteRecord[]> {
  const rows = await tx<QuoteRow[]>`
    select ${tx.unsafe(QUOTE_COLUMNS)} from quotes
    where patient_id = ${patientId}
    order by created_at desc
  `;
  return rows.map(mapQuote);
}

/**
 * Enregistre un règlement saisi par le cabinet.
 *
 * Le montant est plafonné au reste à charge : au-delà, ce n'est plus un
 * règlement mais une erreur de saisie, et un « payé » supérieur au dû
 * fausserait tous les totaux du cabinet.
 */
export async function setQuotePayment(
  tx: Tx,
  quoteId: string,
  input: { status: PaymentStatus; paidAmountCents: number; note?: string | null },
): Promise<void> {
  await tx`
    update quotes set
      payment_status = ${input.status},
      paid_amount_cents = least(
        greatest(${Math.max(0, Math.round(input.paidAmountCents))}, 0),
        remaining_charge_cents
      ),
      paid_at = case
        when ${input.status} in ('paid', 'partial') then coalesce(paid_at, now())
        else null
      end,
      payment_note = ${input.note || null}
    where id = ${quoteId}
  `;
}
