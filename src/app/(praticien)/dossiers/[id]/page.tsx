import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconShield,
} from "@/components/icons";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, CardHeader, cx, DataRow } from "@/components/ui";
import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { computeVisibility } from "@/lib/branching";
import { withTenant } from "@/lib/db";
import { formatAnswer, formatDate, formatTimestamp, shortHash } from "@/lib/format";
import { NON_ANSWERABLE_TYPES } from "@/lib/form-schema";
import type { ProofBundle } from "@/lib/proof";
import { getSubmission, readAnswersWithVigilance } from "@/lib/repos/submissions";
import type { VigilanceAlert } from "@/lib/vigilance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dossier" };

export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const client = await requestContext();

  const data = await withTenant(
    { tenantId: session.tenant.id, actorId: session.user.id },
    async (tx) => {
      const submission = await getSubmission(tx, id);
      if (!submission) return null;

      const { answers, alerts } = await readAnswersWithVigilance(tx, session.tenant.id, id);

      const signatures = await tx<
        {
          signer_name: string;
          level: string;
          document_hash: string;
          signed_at: Date;
          proof: ProofBundle;
        }[]
      >`
        select signer_name, level, document_hash, signed_at, proof
        from signatures where submission_id = ${id} order by signed_at
      `;

      const documents = await tx<
        { id: string; filename: string; byte_size: number | null }[]
      >`
        select id, filename, byte_size
        from documents where submission_id = ${id} order by created_at desc
      `;

      // Consulter un dossier médical est un accès à des données de santé : il
      // se journalise, c'est une exigence de traçabilité RGPD.
      await recordAudit(tx, session.tenant.id, {
        actorType: "user",
        actorId: session.user.id,
        actorLabel: session.user.fullName,
        action: "submission.viewed",
        objectType: "submission",
        objectId: id,
        ip: client.ip,
        userAgent: client.userAgent,
      });

      return { submission, answers, alerts, signatures, documents };
    },
  );

  if (!data) notFound();

  const { submission, answers, alerts, signatures, documents } = data;
  const { sections } = computeVisibility(submission.definition, answers);
  const signature = signatures[0];
  const proof = signature?.proof;
  const patientName = submission.patient
    ? `${submission.patient.firstName} ${submission.patient.lastName}`
    : "Patient non rattaché";

  return (
    <div>
      <FadeUp>
        <Link
          href={submission.patientId ? `/patients/${submission.patientId}` : "/patients"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          {patientName}
        </Link>

        <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-body">{patientName}</h1>
            <p className="mt-1.5 text-[15px] text-muted">
              {submission.templateTitle} · version {submission.formVersion}
              {submission.patient?.birthDate
                ? ` · né(e) le ${formatDate(submission.patient.birthDate)}`
                : ""}
            </p>
          </div>
          {submission.status === "signed" ? (
            <Badge tone="positive">
              <IconCheck className="size-3.5" />
              Signé le {formatDate(submission.signedAt)}
            </Badge>
          ) : null}
        </header>
      </FadeUp>

      <VigilanceBanner alerts={alerts} />

      <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <Stagger className="space-y-4">
          {sections.map(({ section, fields }) => (
            <StaggerItem key={section.id}>
              <Card>
                <CardHeader title={section.title} subtitle={section.description} />
                <dl className="divide-y divide-line">
                  {fields.map((field) => {
                    if (field.type === "info") return null;

                    if (field.type === "consent" || field.type === "photo_consent") {
                      const accepted = answers[field.id] === true;
                      return (
                        <div key={field.id} className="flex gap-3 px-5 py-3">
                          <span
                            className={cx(
                              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                              accepted
                                ? "bg-positive-soft text-positive"
                                : "bg-canvas text-faint",
                            )}
                            aria-hidden="true"
                          >
                            {accepted ? "✓" : "—"}
                          </span>
                          <span
                            className={cx(
                              "text-sm leading-relaxed",
                              accepted ? "text-body" : "text-faint",
                            )}
                          >
                            {field.statement}
                            <span className="sr-only">
                              {accepted ? " — accepté" : " — refusé"}
                            </span>
                          </span>
                        </div>
                      );
                    }

                    if (NON_ANSWERABLE_TYPES.has(field.type)) return null;

                    const raw = answers[field.id];
                    const unanswered = raw === undefined || raw === null || raw === "";

                    return (
                      <div
                        key={field.id}
                        className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_1fr] sm:gap-5"
                      >
                        <dt className="text-sm text-muted">{field.label}</dt>
                        <dd
                          className={cx(
                            "text-sm",
                            unanswered
                              ? "text-faint italic"
                              : "font-semibold text-body",
                          )}
                        >
                          {formatAnswer(field, raw)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeUp delay={0.12} className="space-y-4">
          <Card>
            <CardHeader title="Suivi" />
            <div className="px-5 py-3">
              <DataRow label="Envoyé" value={formatTimestamp(submission.sentAt)} />
              <DataRow label="Ouvert" value={formatTimestamp(submission.firstOpenedAt)} />
              <DataRow label="Complété" value={formatTimestamp(submission.completedAt)} />
              <DataRow label="Signé" value={formatTimestamp(submission.signedAt)} />
            </div>
          </Card>

          {signature && proof ? (
            <Card>
              <CardHeader title="Dossier de preuve" />
              <div className="px-5 py-3">
                <DataRow label="Signataire" value={signature.signer_name} />
                <DataRow label="Niveau eIDAS" value={signature.level} />
                <DataRow label="Adresse IP" value={proof.client?.ip ?? "—"} />
                <DataRow
                  label="Empreinte du PDF"
                  value={shortHash(signature.document_hash)}
                  mono
                />
                <DataRow label="Réponses" value={shortHash(proof.answers?.hash)} mono />
                <DataRow
                  label="Formulaire affiché"
                  value={shortHash(proof.document?.contentHash)}
                  mono
                />
                <DataRow label="Preuve scellée" value={shortHash(proof.hash)} mono />
              </div>

              {proof.reading?.sections?.length ? (
                <div className="border-t border-line px-5 py-4">
                  <p className="mb-2.5 text-xs font-semibold text-muted">
                    Parcours de lecture
                  </p>
                  <ul className="space-y-2">
                    {proof.reading.sections.map((entry) => {
                      const share =
                        proof.reading.totalMs > 0
                          ? (entry.ms / proof.reading.totalMs) * 100
                          : 0;
                      return (
                        <li key={entry.sectionId}>
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="truncate text-muted">
                              {entry.sectionTitle}
                            </span>
                            <span className="tabular shrink-0 text-faint">
                              {Math.round(entry.ms / 1000)} s
                            </span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                            <div
                              className="h-full rounded-full bg-brand-400"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-start gap-2.5 border-t border-line bg-brand-50/60 px-5 py-3.5 text-brand-700">
                <IconShield className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Toute modification du document, des réponses ou du journal rend ces
                  empreintes incohérentes, et donc détectable.
                </p>
              </div>
            </Card>
          ) : null}

          {documents.length > 0 ? (
            <Card>
              <CardHeader title="Documents" />
              <div className="p-2">
                {documents.map((document) => (
                  <a
                    key={document.id}
                    href={`/api/documents/${document.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-canvas"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <IconDownload className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-body">
                      {document.filename}
                    </span>
                    <span className="tabular shrink-0 text-xs text-faint">
                      {document.byte_size
                        ? `${Math.round(document.byte_size / 1024)} Ko`
                        : ""}
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </FadeUp>
      </div>
    </div>
  );
}

function VigilanceBanner({ alerts }: { alerts: VigilanceAlert[] }) {
  if (alerts.length === 0) return null;

  const critical = alerts.filter((alert) => alert.level === "critical");
  const others = alerts.filter((alert) => alert.level !== "critical");
  const severe = critical.length > 0;

  return (
    <FadeUp delay={0.05}>
      <section
        className={cx(
          "mb-5 overflow-hidden rounded-2xl border",
          severe ? "border-flame-200 bg-flame-50" : "border-amber-200 bg-caution-soft",
        )}
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <span
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-xl text-white",
              severe ? "bg-flame-600" : "bg-caution",
            )}
          >
            <IconAlert className="size-5" />
          </span>
          <h2
            className={cx(
              "text-sm font-bold",
              severe ? "text-flame-700" : "text-caution",
            )}
          >
            {alerts.length} point{alerts.length > 1 ? "s" : ""} de vigilance déclaré
            {alerts.length > 1 ? "s" : ""} par le patient
          </h2>
        </div>

        <ul className="mt-3 space-y-2 px-5">
          {[...critical, ...others].map((alert, index) => (
            <li key={`${alert.fieldId}-${index}`} className="flex items-start gap-2.5">
              {/* Un point coloré ne suffit pas : le niveau est aussi écrit. */}
              <Badge tone={alert.level === "critical" ? "danger" : "caution"}>
                {alert.level === "critical" ? "Critique" : "À noter"}
              </Badge>
              <span
                className={cx(
                  "pt-1 text-sm leading-relaxed",
                  severe ? "text-flame-700" : "text-caution",
                )}
              >
                {alert.message}
              </span>
            </li>
          ))}
        </ul>

        {/* Rappel du périmètre : Ryla restitue une déclaration, il ne qualifie
            pas un risque et ne propose aucune conduite à tenir. */}
        <p className="mt-4 border-t border-black/5 px-5 py-3 text-xs text-muted">
          Éléments déclarés par le patient, restitués sans interprétation.
          L'appréciation clinique relève du praticien.
        </p>
      </section>
    </FadeUp>
  );
}
