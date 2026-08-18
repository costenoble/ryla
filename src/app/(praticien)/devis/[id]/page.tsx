import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconCheck, IconClock } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { Badge, Card, CardHeader, DataRow, PageHeader, type BadgeTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { CARE_BASKET_LABELS, formatCents, type CareBasket } from "@/lib/cerfa";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatReflectionDate } from "@/lib/reflection";
import { getPatient } from "@/lib/repos/patients";
import { getQuote, getQuoteLines, quoteReflectionStatus } from "@/lib/repos/quotes";
import { QuoteActions } from "./QuoteActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Devis" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Remis au patient", tone: "brand" },
  accepted: { label: "Accepté", tone: "positive" },
  refused: { label: "Refusé", tone: "neutral" },
  expired: { label: "Expiré", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const quote = await getQuote(tx, id);
    if (!quote) return null;
    return {
      quote,
      lines: await getQuoteLines(tx, id),
      patient: quote.patientId ? await getPatient(tx, quote.patientId) : null,
    };
  });

  if (!data) notFound();

  const { quote, lines, patient } = data;
  const reflection = quoteReflectionStatus(quote);
  const status = STATUS[quote.status] ?? STATUS.draft!;
  const payload = quote.payload as { note?: string; practitionerName?: string };

  return (
    <div>
      <FadeUp>
        <Link
          href="/devis"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Tous les devis
        </Link>

        <PageHeader
          eyebrow={
            quote.kind === "dentaire_cerfa_s3404"
              ? "Devis conventionnel dentaire (CERFA S3404)"
              : "Devis de chirurgie esthétique"
          }
          title={quote.reference}
          description={`Établi le ${formatDate(quote.createdAt)} · valable ${quote.validityDays} jours`}
        />
      </FadeUp>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <FadeUp delay={0.05} className="space-y-6">
          <Card>
            <CardHeader
              title="Actes"
              action={<Badge tone={status.tone}>{status.label}</Badge>}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-faint">
                    <th className="px-5 py-2.5 font-semibold">Code</th>
                    <th className="px-5 py-2.5 font-semibold">Acte</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Honoraires</th>
                    <th className="px-5 py-2.5 text-right font-semibold">AMO</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Reste à charge</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.position} className="border-b border-line/60 align-top">
                      <td className="tabular px-5 py-3 text-muted">{line.ccam_code ?? "—"}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-body">{line.description}</p>
                        <p className="mt-0.5 text-xs text-faint">
                          {line.tooth_numbers?.length
                            ? `Dents ${line.tooth_numbers.join(" ")}`
                            : null}
                          {line.material ? ` · ${line.material}` : null}
                          {line.quantity > 1 ? ` · ×${line.quantity}` : null}
                        </p>
                        {line.care_basket ? (
                          <p className="mt-1 text-xs text-brand-700">
                            {CARE_BASKET_LABELS[line.care_basket as CareBasket]}
                          </p>
                        ) : null}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-body">
                        {formatCents(Number(line.unit_price_cents) * line.quantity)}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-muted">
                        {formatCents(Number(line.amo_cents))}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-semibold text-body">
                        {formatCents(Number(line.patient_cents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 border-t border-line p-5">
              <Line label="Total honoraires" value={formatCents(quote.totalAmountCents)} />
              <Line label="Part assurance maladie" value={formatCents(quote.totalAmoCents)} />
              <Line label="Part complémentaire" value={formatCents(quote.totalAmcCents)} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <span className="text-body">Reste à charge du patient</span>
                <span className="tabular text-flame-700">
                  {formatCents(quote.remainingChargeCents)}
                </span>
              </div>
            </div>
          </Card>

          {payload.note ? (
            <Card>
              <CardHeader title="Note au patient" />
              <p className="px-5 py-4 text-sm leading-relaxed whitespace-pre-line text-muted">
                {payload.note}
              </p>
            </Card>
          ) : null}
        </FadeUp>

        <FadeUp delay={0.1} className="space-y-6">
          <Card>
            <CardHeader title="Suivi" />
            <div className="p-5">
              <QuoteActions
                quoteId={quote.id}
                status={quote.status}
                reflectionRequired={reflection.required}
                reflectionElapsed={reflection.elapsed}
              />
            </div>
          </Card>

          {reflection.required ? (
            <Card
              className={
                reflection.elapsed
                  ? "border-emerald-100 bg-positive-soft"
                  : "border-amber-100 bg-caution-soft"
              }
            >
              <div className="p-5">
                {reflection.elapsed ? (
                  <div className="flex items-start gap-2.5 text-positive">
                    <IconCheck className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">Délai de réflexion écoulé</p>
                      <p className="mt-0.5 text-sm">
                        Depuis le{" "}
                        {reflection.endsAt ? formatReflectionDate(reflection.endsAt) : "—"}.
                        L'intervention peut être programmée.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <IconClock className="mt-0.5 size-4 shrink-0 text-caution" />
                    <div>
                      <p className="text-sm font-bold text-caution">
                        Délai de réflexion en cours — {reflection.remainingDays} jour
                        {reflection.remainingDays > 1 ? "s" : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-caution/90">
                        {reflection.startsAt
                          ? `Démarré à la remise du devis, le ${formatDate(reflection.startsAt)}.`
                          : "Il démarrera à la remise du devis."}
                      </p>
                      <p className="mt-2 text-xs text-caution/80">
                        Délai légal de {reflection.days} jours (art. D6322-30 CSP), non
                        dérogeable même à la demande du patient.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Patient" />
            <div className="p-5">
              {patient ? (
                <>
                  <Link
                    href={`/patients/${patient.id}`}
                    className="font-semibold text-body transition hover:text-brand-700"
                  >
                    {patient.firstName} {patient.lastName}
                  </Link>
                  <div className="mt-3 space-y-1">
                    <DataRow
                      label="Né(e) le"
                      value={patient.birthDate ? formatDate(patient.birthDate) : "—"}
                    />
                    <DataRow label="Praticien" value={payload.practitionerName ?? "—"} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">Aucun patient rattaché.</p>
              )}
            </div>
          </Card>
        </FadeUp>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular text-body">{value}</span>
    </div>
  );
}
