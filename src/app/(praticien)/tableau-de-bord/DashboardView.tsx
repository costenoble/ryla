"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp, FadeUp, HoverLift, ProgressBar, Stagger, StaggerItem } from "@/components/motion";
import { SignatureChart, type Point } from "@/components/SignatureChart";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFile,
  IconPen,
  IconReceipt,
  IconShield,
  IconTrend,
  IconUsers,
  type IconProps,
} from "@/components/icons";
import { Badge, ButtonLink, Card, CardHeader, cx, EmptyState } from "@/components/ui";
import { formatCents } from "@/lib/cerfa";

/**
 * Tableau de bord.
 *
 * Quatre indicateurs, une courbe, deux colonnes de contexte. La tentation est
 * d'en mettre douze ; un praticien ouvre cet écran entre deux patients et doit
 * savoir en trois secondes s'il a quelque chose à traiter.
 *
 * Aucune variation « vs période précédente » n'est affichée : on n'a pas
 * d'historique fiable pour la calculer, et un delta inventé est pire que pas
 * de delta.
 */

export type DashboardData = {
  practitionerName: string;
  cabinetName: string;
  signedCount: number;
  pendingCount: number;
  completionRate: number;
  vigilanceCount: number;
  criticalCount: number;
  patientCount: number;
  templateCount: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesInReflection: number;
  outstandingChargeCents: number;
  series: Point[];
  activity: {
    id: string;
    label: string;
    actor: string;
    objectId: string | null;
    objectType: string | null;
    when: string;
  }[];
};

export function DashboardView({ data }: { data: DashboardData }) {
  const firstName =
    data.practitionerName.replace(/^(Dr|Pr)\.?\s+/i, "").split(/\s+/)[0] ?? "";
  const signedTotal = data.series.reduce((sum, point) => sum + point.count, 0);

  return (
    <div>
      <FadeUp>
        <div className="mb-7">
          <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">
            {data.cabinetName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-body sm:text-[28px]">
            Bonjour {firstName}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            {data.pendingCount > 0
              ? `${data.pendingCount} document${data.pendingCount > 1 ? "s" : ""} en attente de réponse patient.`
              : "Aucun document en attente. Tout est à jour."}
          </p>
          <div className="mt-5">
            <ButtonLink href="/dossiers/nouveau">Envoyer un document</ButtonLink>
          </div>
        </div>
      </FadeUp>

      {data.criticalCount > 0 ? (
        <FadeUp delay={0.05}>
          <Link
            href="/patients?filtre=vigilance"
            className="mb-6 flex items-center gap-3.5 rounded-2xl border border-flame-200 bg-flame-50 p-4 transition hover:border-flame-400"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-flame-600 text-white">
              <IconAlert className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-flame-700">
                {data.criticalCount} dossier{data.criticalCount > 1 ? "s" : ""} avec un
                point de vigilance critique déclaré
              </span>
              <span className="mt-0.5 block text-sm text-flame-700/80">
                Éléments déclarés par le patient, à examiner avant l'acte.
              </span>
            </span>
            <IconChevronRight className="size-5 shrink-0 text-flame-600" />
          </Link>
        </FadeUp>
      ) : null}

      {/* --- Indicateurs ---------------------------------------------------- */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Documents signés"
          value={data.signedCount}
          Icon={IconCheck}
          tone="positive"
          footnote="Depuis la création du cabinet"
        />
        <StatTile
          label="En attente de réponse"
          value={data.pendingCount}
          Icon={IconClock}
          tone="brand"
          footnote="Envoyés, pas encore signés"
        />
        <StatTile
          label="Taux de complétion"
          value={data.completionRate}
          decimals={0}
          suffix=" %"
          Icon={IconTrend}
          tone="brand"
          meter={data.completionRate}
          footnote="Signés / envoyés"
        />
        <StatTile
          label="Points de vigilance"
          value={data.vigilanceCount}
          Icon={IconAlert}
          tone={data.criticalCount > 0 ? "flame" : "neutral"}
          footnote={
            data.criticalCount > 0
              ? `dont ${data.criticalCount} critique${data.criticalCount > 1 ? "s" : ""}`
              : "Aucun critique"
          }
        />
      </Stagger>

      {/* --- Courbe + contexte ---------------------------------------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <FadeUp delay={0.1} className="lg:col-span-2 lg:self-start">
          <Card>
            <CardHeader
              title="Signatures des 14 derniers jours"
              subtitle={
                signedTotal > 0
                  ? `${signedTotal} document${signedTotal > 1 ? "s" : ""} signé${signedTotal > 1 ? "s" : ""} sur la période`
                  : "Aucune signature sur la période"
              }
            />
            <div className="px-3 pt-4 pb-2">
              <SignatureChart series={data.series} />
            </div>
          </Card>
        </FadeUp>

        <FadeUp delay={0.16} className="space-y-5">
          <Card>
            <CardHeader title="Devis" />
            <div className="space-y-3.5 px-5 py-4">
              {data.quotesInReflection > 0 ? (
                <div className="rounded-xl bg-caution-soft p-3.5 ring-1 ring-amber-100 ring-inset">
                  <div className="flex items-center gap-2 text-caution">
                    <IconClock className="size-4" />
                    <span className="text-sm font-semibold">
                      {data.quotesInReflection} en délai de réflexion
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-caution/90">
                    Délai légal de 15 jours (art. D6322-30 CSP). Aucune intervention
                    ni acceptation avant son terme.
                  </p>
                </div>
              ) : null}

              <MiniRow label="Remis au patient" value={data.quotesSent} />
              <MiniRow label="Acceptés" value={data.quotesAccepted} />
              <MiniRow
                label="Reste à charge engagé"
                value={formatCents(data.outstandingChargeCents)}
              />

              <Link
                href="/devis"
                className="flex items-center gap-1.5 pt-1 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Voir tous les devis
                <IconChevronRight className="size-4" />
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Cabinet" />
            <div className="space-y-3.5 px-5 py-4">
              <MiniRow
                label="Patients"
                value={data.patientCount}
                Icon={IconUsers}
              />
              <MiniRow
                label="Modèles publiés"
                value={data.templateCount}
                Icon={IconFile}
              />
              <div className="flex items-start gap-2.5 rounded-xl bg-brand-50 p-3 text-brand-700">
                <IconShield className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Journal d'audit chaîné : toute modification d'un consentement
                  signé est détectable.
                </p>
              </div>
            </div>
          </Card>
        </FadeUp>
      </div>

      {/* --- Activité -------------------------------------------------------- */}
      <FadeUp delay={0.22} className="mt-5">
        <Card>
          <CardHeader
            title="Activité récente"
            subtitle="Extrait du journal d'audit du cabinet"
          />
          {data.activity.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<IconPen className="size-5" />}
                title="Rien à afficher pour l'instant"
                description="Les envois, ouvertures et signatures apparaîtront ici."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.activity.map((entry) => (
                <li key={entry.id}>
                  <ActivityRow entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </FadeUp>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TILE_TONES = {
  brand: "bg-brand-50 text-brand-600",
  positive: "bg-positive-soft text-positive",
  flame: "bg-flame-50 text-flame-600",
  neutral: "bg-canvas text-muted",
} as const;

function StatTile({
  label,
  value,
  Icon,
  tone,
  suffix,
  decimals = 0,
  footnote,
  meter,
}: {
  label: string;
  value: number;
  Icon: (props: IconProps) => React.ReactElement;
  tone: keyof typeof TILE_TONES;
  suffix?: string;
  decimals?: number;
  footnote?: string;
  meter?: number;
}) {
  return (
    <StaggerItem className="h-full">
      <HoverLift className="h-full">
        <Card className="h-full p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-balance text-muted">{label}</p>
            <span
              className={cx(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                TILE_TONES[tone],
              )}
            >
              <Icon className="size-4" />
            </span>
          </div>

          {/* Chiffres proportionnels : en grand corps, le tabulaire fait des
              trous entre les chiffres. */}
          <p className="mt-3 text-[32px] leading-none font-bold tracking-tight text-body">
            <CountUp value={value} suffix={suffix} decimals={decimals} />
          </p>

          {meter !== undefined ? (
            <ProgressBar value={meter} className="mt-3.5" />
          ) : null}

          {footnote ? (
            <p className="mt-2.5 text-xs text-faint">{footnote}</p>
          ) : null}
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}

function MiniRow({
  label,
  value,
  Icon,
}: {
  label: string;
  value: ReactNode;
  Icon?: (props: IconProps) => React.ReactElement;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-muted">
        {Icon ? <Icon className="size-4 text-faint" /> : null}
        {label}
      </span>
      <span className="tabular text-sm font-semibold text-body">{value}</span>
    </div>
  );
}

function ActivityRow({ entry }: { entry: DashboardData["activity"][number] }) {
  const isSignature = entry.label.includes("signé");
  const href =
    entry.objectType === "submission" && entry.objectId
      ? `/dossiers/${entry.objectId}`
      : null;

  const content = (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isSignature ? "bg-positive-soft text-positive" : "bg-canvas text-faint",
        )}
      >
        {isSignature ? <IconPen className="size-4" /> : <IconFile className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-body">
          {entry.label}
        </span>
        <span className="block truncate text-xs text-faint">{entry.actor}</span>
      </span>
      <span className="tabular shrink-0 text-xs text-faint">{entry.when}</span>
      {href ? <IconChevronRight className="size-4 shrink-0 text-line-strong" /> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition hover:bg-canvas">
      {content}
    </Link>
  ) : (
    content
  );
}

export { Badge };
