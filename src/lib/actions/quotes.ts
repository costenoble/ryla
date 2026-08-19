"use server";

import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requestContext, requireCapability } from "@/lib/auth";
import {
  CARE_BASKETS,
  CARE_BASKET_LABELS,
  checkCerfaCompleteness,
  type QuoteLineInput,
} from "@/lib/cerfa";
import { withTenant, type Tx } from "@/lib/db";
import { issueAccessToken } from "@/lib/magic-link";
import { patientInvitation, trySend } from "@/lib/notifications";
import { renderQuotePdf } from "@/lib/pdf";
import { createQuoteSignature } from "@/lib/quote-signature";
import { REFLECTION_DAYS_ESTHETIQUE } from "@/lib/reflection";
import { getPatient } from "@/lib/repos/patients";
import {
  acceptQuote,
  createQuote,
  deliverQuote,
  getQuote,
  getQuoteLines,
} from "@/lib/repos/quotes";
import { getTenantSelf, formatAddress } from "@/lib/repos/tenants";
import { letterheadBlocks } from "@/lib/letterhead";

/**
 * Devis établis dans Ryla.
 *
 * Deux régimes, et ils ne se ressemblent pas :
 *  • dentaire — devis conventionnel CERFA S3404, mentions obligatoires
 *    contrôlées avant enregistrement ;
 *  • esthétique — délai de réflexion de quinze jours (art. D6322-30 CSP),
 *    imposé ici et non proposé : il n'est pas dérogeable, même à la demande
 *    du patient.
 *
 * Le délai part de la *remise* du devis, horodatée par la base. Il n'est donc
 * pas pilotable depuis cette action : `deliverQuoteAction` déclenche le
 * compteur, et rien ne permet de le remonter.
 */

const lineSchema = z.object({
  description: z.string().min(1).max(300),
  ccamCode: z.string().max(20).nullable().optional(),
  toothNumbers: z.array(z.string().max(4)).max(32).nullable().optional(),
  careBasket: z.enum(CARE_BASKETS).nullable().optional(),
  material: z.string().max(120).nullable().optional(),
  quantity: z.number().int().min(1).max(99),
  unitPriceCents: z.number().int().min(0).max(100_000_00),
  baseReimbursementCents: z.number().int().min(0).max(100_000_00),
  reimbursementRate: z.number().min(0).max(1),
  amcCents: z.number().int().min(0).max(100_000_00).optional(),
});

const payloadSchema = z.object({
  kind: z.enum(["dentaire_cerfa_s3404", "esthetique"]),
  patientId: z.string().uuid().nullable(),
  validityDays: z.number().int().min(1).max(365),
  lines: z.array(lineSchema).min(1).max(60),
  note: z.string().max(2000).optional(),
});

export type QuoteFormState =
  | { status: "idle" }
  | { status: "error"; message: string; issues?: string[] }
  | { status: "created"; quoteId: string; remainingChargeCents: number };

/**
 * Numéro de devis, par cabinet et par année.
 *
 * Compté plutôt que tiré d'une séquence : une séquence PostgreSQL est globale,
 * et deux cabinets partageraient alors la même suite — « D-2026-0001 » puis
 * « D-2026-0007 » chez le voisin, ce qui se remarque et se commente.
 */
async function nextReference(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await tx<{ count: string }[]>`
    select count(*)::text as count from quotes
    where reference like ${`D-${year}-%`}
  `;
  const next = Number(row?.count ?? 0) + 1;
  return `D-${year}-${String(next).padStart(4, "0")}`;
}

export async function createQuoteDraft(
  _previous: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const session = await requireCapability("quotes.write");
  const client = await requestContext();

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(String(formData.get("payload") ?? "")));
  } catch {
    return { status: "error", message: "Le devis est incomplet ou mal formé." };
  }

  const lines: QuoteLineInput[] = payload.lines.map((line) => ({
    description: line.description,
    ccamCode: line.ccamCode ?? null,
    toothNumbers: line.toothNumbers ?? null,
    careBasket: line.careBasket ?? null,
    material: line.material ?? null,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    baseReimbursementCents: line.baseReimbursementCents,
    reimbursementRate: line.reimbursementRate,
    amcCents: line.amcCents,
  }));

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const tenant = await getTenantSelf(tx);
        const patient = payload.patientId
          ? await getPatient(tx, payload.patientId)
          : null;

        // Le contrôle des mentions obligatoires est fait côté serveur, pas
        // seulement à la saisie : un devis conventionnel incomplet, c'est un
        // rejet de prise en charge ou un litige.
        if (payload.kind === "dentaire_cerfa_s3404") {
          const missing = checkCerfaCompleteness(
            {
              practitionerName: session.user.fullName,
              practitionerIdentifier: session.user.rpps,
              practiceAddress: formatAddress(tenant.address),
              patientLastName: patient?.lastName,
              patientFirstName: patient?.firstName,
              patientBirthDate: patient?.birthDate?.toISOString().slice(0, 10),
              issuedOn: new Date().toISOString().slice(0, 10),
              validityDays: payload.validityDays,
            },
            lines,
          );
          if (missing.length > 0) {
            throw new IncompleteQuote(missing);
          }
        }

        const reference = await nextReference(tx);

        const created = await createQuote(tx, {
          tenantId: session.tenant.id,
          kind: payload.kind,
          reference,
          lines,
          patientId: payload.patientId,
          practitionerId: session.user.id,
          validityDays: payload.validityDays,
          // Le délai n'est pas un choix offert à l'interface : il découle du
          // régime du devis.
          reflectionPeriodDays:
            payload.kind === "esthetique" ? REFLECTION_DAYS_ESTHETIQUE : 0,
          payload: {
            note: payload.note ?? "",
            practitionerName: session.user.fullName,
            practitionerIdentifier: session.user.rpps,
            practiceAddress: formatAddress(tenant.address),
            letterhead: {
              mode: tenant.branding.letterheadMode ?? "none",
              text: tenant.branding.letterheadText ?? "",
            },
          },
          importSource: "manual",
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "quote.created",
          objectType: "quote",
          objectId: created.quoteId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: {
            reference,
            kind: payload.kind,
            lines: lines.length,
            remainingChargeCents: created.remainingChargeCents,
          },
        });

        return created;
      },
    );

    return {
      status: "created",
      quoteId: result.quoteId,
      remainingChargeCents: result.remainingChargeCents,
    };
  } catch (error) {
    if (error instanceof IncompleteQuote) {
      return {
        status: "error",
        message: "Le devis conventionnel comporte des mentions manquantes.",
        issues: error.issues,
      };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'enregistrement a échoué.",
    };
  }
}

class IncompleteQuote extends Error {
  constructor(readonly issues: string[]) {
    super("Devis incomplet.");
  }
}

// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

export type QuoteActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "delivered"; reflectionEndsAt: string | null }
  | { status: "accepted" }
  | {
      status: "sent";
      url: string;
      emailedTo: string | null;
      deliveryError: string | null;
    };

/**
 * Envoi d'un devis Ryla au patient, pour signature.
 *
 * Même chemin qu'un devis importé du logiciel métier : le PDF est produit, puis
 * annexé à un dossier de signature ordinaire. Il hérite donc de tout ce qui
 * existe déjà — lien magique, mesure du temps de lecture, déclarations
 * horodatées, chaîne d'audit — sans qu'aucune de ces mécaniques ait à savoir
 * d'où vient la pièce.
 *
 * La remise est faite au passage : c'est bien cet instant, celui où le devis
 * part chez le patient, qui doit faire courir le délai de réflexion.
 */
export async function sendQuoteForSignature(
  _previous: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const session = await requireCapability("quotes.write");
  const client = await requestContext();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) return { status: "error", message: "Devis introuvable." };

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const quote = await getQuote(tx, quoteId);
        if (!quote) throw new Error("Devis introuvable.");
        if (!quote.patientId) {
          throw new Error("Rattachez un patient au devis avant de l'envoyer.");
        }

        const patient = await getPatient(tx, quote.patientId);
        if (!patient) throw new Error("Patient introuvable.");

        const tenant = await getTenantSelf(tx);
        const lines = await getQuoteLines(tx, quoteId);
        const payload = quote.payload as {
          note?: string;
          practitionerName?: string;
          practitionerIdentifier?: string;
        };

        const { bytes, sha256 } = await renderQuotePdf({
          reference: quote.reference,
          kind: quote.kind,
          issuedOn: quote.createdAt,
          validityDays: quote.validityDays,
          reflectionPeriodDays: quote.reflectionPeriodDays,
          tenant: {
            name: tenant.name,
            legalNotice: tenant.legalNotice,
            address: formatAddress(tenant.address),
            brandColor: tenant.branding.primaryColor ?? null,
            letterhead:
              tenant.branding.letterheadMode === "text"
                ? letterheadBlocks(tenant.branding)
                : null,
          },
          practitioner: {
            name: payload.practitionerName ?? session.user.fullName,
            identifier: payload.practitionerIdentifier ?? session.user.rpps,
          },
          patient: {
            displayName: `${patient.firstName} ${patient.lastName}`,
            birthDate: patient.birthDate?.toLocaleDateString("fr-FR") ?? null,
          },
          lines: lines.map((line) => ({
            code: line.ccam_code,
            description: line.description,
            toothNumbers: line.tooth_numbers,
            material: line.material,
            careBasketLabel: line.care_basket
              ? CARE_BASKET_LABELS[line.care_basket]
              : null,
            quantity: line.quantity,
            grossCents: Number(line.unit_price_cents) * line.quantity,
            amoCents: Number(line.amo_cents),
            amcCents: Number(line.amc_cents),
            patientCents: Number(line.patient_cents),
          })),
          totals: {
            totalAmountCents: quote.totalAmountCents,
            totalAmoCents: quote.totalAmoCents,
            totalAmcCents: quote.totalAmcCents,
            remainingChargeCents: quote.remainingChargeCents,
          },
          note: payload.note ?? null,
        });

        const submissionId = await createQuoteSignature(tx, {
          tenantId: session.tenant.id,
          userId: session.user.id,
          patientId: quote.patientId,
          kind: quote.kind === "esthetique" ? "esthetique" : "dentaire",
          filename: `devis-${quote.reference}.pdf`,
          bytes,
          sha256,
          origin: "generated",
        });

        await tx`
          update quotes set submission_id = ${submissionId} where id = ${quoteId}
        `;

        // La remise fait courir le délai : elle a lieu ici, à l'envoi réel.
        if (quote.status === "draft") await deliverQuote(tx, quoteId);

        const token = await issueAccessToken(tx, {
          tenantId: session.tenant.id,
          tenantSlug: session.tenant.slug,
          submissionId,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "quote.sent_for_signature",
          objectType: "quote",
          objectId: quoteId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { reference: quote.reference, documentSha256: sha256 },
        });

        return {
          url: token.url,
          expiresAt: token.expiresAt,
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
      url: result.url,
      emailedTo: delivery.sent ? result.recipient : null,
      deliveryError: delivery.error,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'envoi a échoué.",
    };
  }
}

/**
 * Remise du devis au patient — c'est cet instant qui fait courir le délai.
 *
 * Irréversible par construction : `deliverQuote` n'agit que sur un brouillon,
 * et l'horodatage vient de `now()` côté base. Rien dans l'interface ne permet
 * de l'antidater, et c'est le but.
 */
export async function deliverQuoteAction(
  _previous: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const session = await requireCapability("quotes.write");
  const client = await requestContext();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) return { status: "error", message: "Devis introuvable." };

  try {
    const quote = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const delivered = await deliverQuote(tx, quoteId);
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "quote.delivered",
          objectType: "quote",
          objectId: quoteId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: {
            reference: delivered.reference,
            reflectionEndsAt: delivered.reflectionEndsAt?.toISOString() ?? null,
          },
        });
        return delivered;
      },
    );

    return {
      status: "delivered",
      reflectionEndsAt: quote.reflectionEndsAt?.toISOString() ?? null,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "La remise a échoué.",
    };
  }
}

/**
 * Acceptation du devis.
 *
 * Le refus vient d'ici, côté serveur, et pas du bouton masqué dans
 * l'interface : c'est ce contrôle qui fait foi si quelqu'un rejoue la requête.
 */
export async function acceptQuoteAction(
  _previous: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const session = await requireCapability("quotes.write");
  const client = await requestContext();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) return { status: "error", message: "Devis introuvable." };

  try {
    const outcome = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const result = await acceptQuote(tx, quoteId);
        if (result.accepted) {
          await recordAudit(tx, session.tenant.id, {
            actorType: "user",
            actorId: session.user.id,
            actorLabel: session.user.fullName,
            action: "quote.accepted",
            objectType: "quote",
            objectId: quoteId,
            ip: client.ip,
            userAgent: client.userAgent,
            metadata: { reference: result.quote.reference },
          });
        }
        return result;
      },
    );

    if (!outcome.accepted) {
      return { status: "error", message: outcome.reason };
    }
    return { status: "accepted" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'acceptation a échoué.",
    };
  }
}
