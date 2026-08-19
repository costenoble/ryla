import type { Metadata } from "next";
import Link from "next/link";
import { IconCheck, IconClock, IconReceipt } from "@/components/icons";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatCents } from "@/lib/cerfa";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatReflectionDate } from "@/lib/reflection";
import { listQuotes, quoteReflectionStatus, type QuoteRecord } from "@/lib/repos/quotes";

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

export default async function DevisPage() {
  const session = await requireSession();
  const quotes = await withTenant({ tenantId: session.tenant.id }, (tx) => listQuotes(tx));

  const inReflection = quotes.filter(
    (quote) => quoteReflectionStatus(quote).required && !quoteReflectionStatus(quote).elapsed,
  ).length;

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Cabinet"
          title="Devis"
          description={
            quotes.length === 0
              ? "Les devis conventionnels et esthétiques apparaîtront ici."
              : `${quotes.length} devis${
                  inReflection > 0 ? ` · ${inReflection} en délai de réflexion` : ""
                }`
          }
          action={
            <div className="flex flex-wrap gap-2.5">
              <ButtonLink href="/devis/importer" variant="outline">
                Importer un devis
              </ButtonLink>
              <ButtonLink href="/devis/nouveau">Nouveau devis</ButtonLink>
            </div>
          }
        />
      </FadeUp>

      {quotes.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={<IconReceipt className="size-5" />}
            title="Aucun devis pour l'instant"
            description="Composez-en un à partir du référentiel CCAM / NGAP, ou importez celui de votre logiciel métier pour le faire signer."
            action={
              <div className="flex flex-wrap justify-center gap-2.5">
                <ButtonLink href="/devis/nouveau">Créer un devis</ButtonLink>
                <ButtonLink href="/devis/importer" variant="outline">
                  Importer un devis
                </ButtonLink>
              </div>
            }
          />
        </FadeUp>
      ) : (
        <Stagger className="space-y-4">
          {quotes.map((quote) => (
            <StaggerItem key={quote.id}>
              <QuoteCard quote={quote} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function QuoteCard({ quote }: { quote: QuoteRecord }) {
  const reflection = quoteReflectionStatus(quote);
  const status = STATUS[quote.status];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/devis/${quote.id}`}
              className="tabular font-bold text-body transition hover:text-brand-700"
            >
              {quote.reference}
            </Link>
            <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? quote.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {quote.kind === "dentaire_cerfa_s3404"
              ? "Devis conventionnel dentaire (CERFA S3404)"
              : "Devis de chirurgie esthétique"}
            {" · établi le "}
            {formatDate(quote.createdAt)}
          </p>
        </div>

        <div className="text-right">
          <p className="tabular text-xl font-bold text-body">
            {formatCents(quote.totalAmountCents)}
          </p>
          <p className="tabular mt-0.5 text-sm text-muted">
            reste à charge{" "}
            <span className="font-semibold text-flame-700">
              {formatCents(quote.remainingChargeCents)}
            </span>
          </p>
        </div>
      </div>

      {reflection.required ? (
        <div
          className={
            reflection.elapsed
              ? "border-t border-emerald-100 bg-positive-soft px-5 py-4"
              : "border-t border-amber-100 bg-caution-soft px-5 py-4"
          }
        >
          {reflection.elapsed ? (
            <div className="flex items-start gap-2.5 text-positive">
              <IconCheck className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm font-semibold">
                Délai de réflexion écoulé depuis le{" "}
                {reflection.endsAt ? formatReflectionDate(reflection.endsAt) : "—"} —
                l'intervention peut être programmée.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <IconClock className="mt-0.5 size-4 shrink-0 text-caution" />
              <div>
                <p className="text-sm font-bold text-caution">
                  Délai de réflexion en cours — {reflection.remainingDays} jour
                  {reflection.remainingDays > 1 ? "s" : ""} restant
                  {reflection.remainingDays > 1 ? "s" : ""}
                </p>
                <p className="mt-0.5 text-sm text-caution/90">
                  Aucune intervention ni acceptation avant le{" "}
                  {reflection.endsAt ? formatReflectionDate(reflection.endsAt) : "—"}.
                </p>
                {/* Le blocage est côté serveur : cet encart informe, il ne
                    protège pas. */}
                <p className="mt-2 text-xs text-caution/80">
                  Délai légal de {reflection.days} jours (art. D6322-30 CSP). Il n'est
                  pas dérogeable, même à la demande du patient.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {quote.acceptedAt ? (
        <p className="border-t border-line px-5 py-3 text-sm text-muted">
          Accepté le {formatDate(quote.acceptedAt)}.
        </p>
      ) : null}
    </Card>
  );
}
