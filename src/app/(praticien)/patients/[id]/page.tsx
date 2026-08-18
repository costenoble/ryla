import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconFile,
  IconPen,
  IconReceipt,
  IconUsers,
} from "@/components/icons";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  cx,
  DataRow,
  EmptyState,
  type BadgeTone,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatCents } from "@/lib/cerfa";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatReflectionDate } from "@/lib/reflection";
import {
  getPatient,
  listPatientDocuments,
  type PatientDocument,
} from "@/lib/repos/patients";
import { listQuotesForPatient, quoteReflectionStatus } from "@/lib/repos/quotes";
import { PaymentForm } from "./PaymentForm";
import { ResendLink } from "./ResendLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patient" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "brand" },
  in_progress: { label: "En cours", tone: "caution" },
  completed: { label: "Complété", tone: "brand" },
  signed: { label: "Signé", tone: "positive" },
  expired: { label: "Expiré", tone: "neutral" },
  revoked: { label: "Révoqué", tone: "neutral" },
};

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const patient = await getPatient(tx, id);
    if (!patient) return null;
    const [documents, quotes] = await Promise.all([
      listPatientDocuments(tx, id),
      listQuotesForPatient(tx, id),
    ]);
    return { patient, documents, quotes };
  });

  if (!data) notFound();
  const { patient, documents, quotes } = data;

  const outstanding = quotes
    .filter((q) => ["sent", "accepted"].includes(q.status) && q.paymentStatus !== "waived")
    .reduce((sum, q) => sum + Math.max(0, q.remainingChargeCents - q.paidAmountCents), 0);

  return (
    <div>
      <FadeUp>
        <Link
          href="/patients"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Patients
        </Link>

        <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-body">
              {patient.lastName.toUpperCase()} {patient.firstName}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted">
              {patient.birthDate ? <span>né(e) le {formatDate(patient.birthDate)}</span> : null}
              {patient.email ? <span>{patient.email}</span> : null}
              {patient.phone ? <span className="tabular">{patient.phone}</span> : null}
            </p>
            {patient.needsLegalRepresentative ? (
              <p className="mt-2">
                <Badge tone="ink">
                  <IconUsers className="size-3.5" />
                  Représentant légal : {patient.legalRepresentative?.fullName ?? "non renseigné"}
                  {patient.legalRepresentative?.relationship
                    ? ` (${patient.legalRepresentative.relationship})`
                    : ""}
                </Badge>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <ButtonLink href={`/dossiers/nouveau?patient=${patient.id}`}>
              Envoyer un document
            </ButtonLink>
            <ButtonLink href={`/devis/nouveau?patient=${patient.id}`} variant="outline">
              Nouveau devis
            </ButtonLink>
            <ButtonLink href={`/patients/${patient.id}/modifier`} variant="outline">
              Modifier
            </ButtonLink>
          </div>
        </header>
      </FadeUp>

      {outstanding > 0 ? (
        <FadeUp delay={0.04}>
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-flame-200 bg-flame-50 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-flame-600 text-white">
              <IconReceipt className="size-5" />
            </span>
            <p className="text-sm font-semibold text-flame-700">
              {formatCents(outstanding)} restent à régler sur ses devis
            </p>
          </div>
        </FadeUp>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* --- Documents --------------------------------------------------- */}
          <FadeUp delay={0.06}>
            <Card>
              <CardHeader
                title="Documents"
                subtitle={
                  documents.length === 0
                    ? "Aucun document envoyé"
                    : `${documents.length} document${documents.length > 1 ? "s" : ""}`
                }
              />
              {documents.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<IconFile className="size-5" />}
                    title="Rien d'envoyé pour l'instant"
                    description="Questionnaires, consentements et autorisations apparaîtront ici."
                    action={
                      <ButtonLink href={`/dossiers/nouveau?patient=${patient.id}`}>
                        Envoyer un document
                      </ButtonLink>
                    }
                  />
                </div>
              ) : (
                <Stagger className="divide-y divide-line">
                  {documents.map((document) => (
                    <StaggerItem key={document.id}>
                      <DocumentRow document={document} />
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </Card>
          </FadeUp>

          {/* --- Devis ------------------------------------------------------- */}
          <FadeUp delay={0.1}>
            <Card>
              <CardHeader
                title="Devis"
                subtitle={
                  quotes.length === 0
                    ? "Aucun devis"
                    : `${quotes.length} devis · ${formatCents(outstanding)} à régler`
                }
              />
              {quotes.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<IconReceipt className="size-5" />}
                    title="Aucun devis"
                    description="Les devis conventionnels et esthétiques de ce patient apparaîtront ici."
                  />
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {quotes.map((quote) => {
                    const reflection = quoteReflectionStatus(quote);
                    return (
                      <div key={quote.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="tabular font-semibold text-body">
                            {quote.reference}
                          </span>
                          <span className="tabular text-sm text-muted">
                            {formatCents(quote.totalAmountCents)} · reste à charge{" "}
                            <span className="font-semibold text-flame-700">
                              {formatCents(quote.remainingChargeCents)}
                            </span>
                          </span>
                        </div>

                        {reflection.required && !reflection.elapsed ? (
                          <p className="mt-2 rounded-md bg-caution-soft px-3 py-2 text-xs text-caution">
                            Délai de réflexion en cours — {reflection.remainingDays} jour
                            {reflection.remainingDays > 1 ? "s" : ""} restant. Aucune
                            intervention avant le{" "}
                            {reflection.endsAt ? formatReflectionDate(reflection.endsAt) : "—"}.
                          </p>
                        ) : null}

                        <div className="mt-3">
                          <PaymentForm
                            quoteId={quote.id}
                            paymentStatus={quote.paymentStatus}
                            paidAmountCents={quote.paidAmountCents}
                            remainingChargeCents={quote.remainingChargeCents}
                            paymentNote={quote.paymentNote}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </FadeUp>
        </div>

        {/* --- Colonne latérale ---------------------------------------------- */}
        <FadeUp delay={0.14} className="space-y-5">
          <Card>
            <CardHeader title="Fiche" />
            <div className="px-5 py-3">
              <DataRow label="Créé le" value={formatDate(patient.createdAt)} />
              <DataRow label="Documents" value={String(documents.length)} />
              <DataRow
                label="Signés"
                value={String(documents.filter((d) => d.status === "signed").length)}
              />
              <DataRow
                label="En attente"
                value={String(
                  documents.filter((d) => ["sent", "in_progress"].includes(d.status)).length,
                )}
              />
              <DataRow label="Reste à régler" value={formatCents(outstanding)} />
            </div>
          </Card>

          {patient.notes ? (
            <Card>
              <CardHeader title="Notes internes" />
              <p className="px-5 py-4 text-sm leading-relaxed whitespace-pre-line text-muted">
                {patient.notes}
              </p>
            </Card>
          ) : null}
        </FadeUp>
      </div>
    </div>
  );
}

function DocumentRow({ document }: { document: PatientDocument }) {
  const status = STATUS[document.status] ?? STATUS.draft!;
  const signed = document.status === "signed";
  const pending = ["sent", "in_progress"].includes(document.status);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dossiers/${document.id}`}
            className="inline-flex items-center gap-1.5 font-semibold text-body transition hover:text-brand-700"
          >
            {document.templateTitle}
            <IconChevronRight className="size-4 text-line-strong" />
          </Link>
          <p className="tabular mt-0.5 text-xs text-faint">
            {signed && document.signedAt
              ? `Signé le ${formatDate(document.signedAt)}`
              : document.sentAt
                ? `Envoyé le ${formatDate(document.sentAt)}`
                : `Créé le ${formatDate(document.createdAt)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {document.vigilanceCount > 0 ? (
            <Badge tone={document.vigilanceMaxLevel === "critical" ? "danger" : "caution"}>
              <IconAlert className="size-3.5" />
              {document.vigilanceCount}
            </Badge>
          ) : null}
          <Badge tone={status.tone}>
            {signed ? <IconCheck className="size-3.5" /> : null}
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {/* Le praticien veut deux choses après une signature : relire les
            réponses, et récupérer le PDF. Les deux à un clic. */}
        <Link
          href={`/dossiers/${document.id}`}
          className="text-xs font-semibold text-brand-600 underline underline-offset-2 transition hover:text-brand-700"
        >
          Voir les réponses
        </Link>
        {document.pdfDocumentId ? (
          <a
            href={`/api/documents/${document.pdfDocumentId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 underline underline-offset-2 transition hover:text-brand-700"
          >
            <IconDownload className="size-3.5" />
            Télécharger le PDF
          </a>
        ) : null}
        {signed ? (
          <span className="inline-flex items-center gap-1 text-xs text-faint">
            <IconPen className="size-3.5" />
            Document figé
          </span>
        ) : null}
      </div>

      {pending ? <ResendLink submissionId={document.id} /> : null}
    </div>
  );
}
