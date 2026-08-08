import type { Metadata } from "next";
import Link from "next/link";
import { IconAlert, IconChevronRight, IconUsers } from "@/components/icons";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import {
  Badge,
  ButtonLink,
  Card,
  cx,
  EmptyState,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatCents } from "@/lib/cerfa";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listPatients, type PatientFilter, type PatientListItem } from "@/lib/repos/patients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Patients" };

const FILTERS: { key: PatientFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "pending", label: "En attente" },
  { key: "vigilance", label: "Vigilance" },
  { key: "unpaid", label: "Reste à régler" },
];

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtre?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const filter = (FILTERS.find((f) => f.key === params.filtre)?.key ?? "all") as PatientFilter;

  const patients = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    listPatients(tx, { search, filter }),
  );

  const isFiltered = search !== "" || filter !== "all";

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Cabinet"
          title="Patients"
          description={
            patients.length === 0 && !isFiltered
              ? "Créez un patient, ou envoyez-lui directement un document."
              : `${patients.length} patient${patients.length > 1 ? "s" : ""}`
          }
          action={<ButtonLink href="/patients/nouveau">Nouveau patient</ButtonLink>}
        />
      </FadeUp>

      {/* Recherche et filtres : un formulaire GET, donc une URL partageable et
          un retour arrière qui fait ce qu'on attend. */}
      <FadeUp delay={0.04}>
        <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Rechercher un patient…"
            aria-label="Rechercher un patient"
            className={cx(inputClass, "h-11 max-w-xs")}
          />
          {filter !== "all" ? <input type="hidden" name="filtre" value={filter} /> : null}
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-body transition hover:border-brand-300"
          >
            Rechercher
          </button>

          <span className="ml-auto flex flex-wrap gap-1.5">
            {FILTERS.map((entry) => {
              const href =
                entry.key === "all"
                  ? `/patients${search ? `?q=${encodeURIComponent(search)}` : ""}`
                  : `/patients?filtre=${entry.key}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
              const active = entry.key === filter;
              return (
                <Link
                  key={entry.key}
                  href={href}
                  aria-current={active ? "true" : undefined}
                  className={cx(
                    "rounded-full px-3.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-ink-900 text-white"
                      : "border border-line-strong bg-surface text-muted hover:text-body",
                  )}
                >
                  {entry.label}
                </Link>
              );
            })}
          </span>
        </form>
      </FadeUp>

      {patients.length === 0 ? (
        <FadeUp delay={0.06}>
          <EmptyState
            icon={<IconUsers className="size-5" />}
            title={isFiltered ? "Aucun patient ne correspond" : "Aucun patient"}
            description={
              isFiltered
                ? "Essayez un autre nom, ou retirez les filtres."
                : "Créez une fiche patient, ou envoyez un document — le patient sera créé au passage."
            }
            action={
              isFiltered ? (
                <ButtonLink href="/patients" variant="outline">
                  Retirer les filtres
                </ButtonLink>
              ) : (
                <ButtonLink href="/patients/nouveau">Nouveau patient</ButtonLink>
              )
            }
          />
        </FadeUp>
      ) : (
        <>
          <Stagger className="space-y-3 lg:hidden">
            {patients.map((patient) => (
              <StaggerItem key={patient.id}>
                <MobileCard patient={patient} />
              </StaggerItem>
            ))}
          </Stagger>

          <FadeUp delay={0.06} className="hidden lg:block">
            <Card className="overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/70">
                    <Th>Patient</Th>
                    <Th>Documents</Th>
                    <Th>Vigilance</Th>
                    <Th className="text-right">Reste à régler</Th>
                    <Th className="text-right">Dernière activité</Th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="group transition hover:bg-canvas/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/patients/${patient.id}`}
                          className="font-semibold text-body transition group-hover:text-brand-700"
                        >
                          {patient.lastName.toUpperCase()} {patient.firstName}
                        </Link>
                        {patient.birthDate ? (
                          <span className="tabular ml-2 text-xs text-faint">
                            {formatDate(patient.birthDate)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        <DocumentSummary patient={patient} />
                      </td>
                      <td className="px-5 py-3.5">
                        <VigilanceBadge patient={patient} />
                      </td>
                      <td className="tabular px-5 py-3.5 text-right">
                        {patient.outstandingCents > 0 ? (
                          <span className="font-semibold text-flame-700">
                            {formatCents(patient.outstandingCents)}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="tabular px-5 py-3.5 text-right text-muted">
                        {patient.lastActivityAt ? formatDate(patient.lastActivityAt) : "—"}
                      </td>
                      <td className="pr-4">
                        <IconChevronRight className="size-4 text-line-strong transition group-hover:text-brand-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </FadeUp>
        </>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        "px-5 py-3 text-xs font-semibold tracking-wider text-faint uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function DocumentSummary({ patient }: { patient: PatientListItem }) {
  if (patient.documentCount === 0) {
    return <span className="text-faint">Aucun</span>;
  }
  const parts: string[] = [];
  if (patient.signedCount > 0) parts.push(`${patient.signedCount} signé${patient.signedCount > 1 ? "s" : ""}`);
  if (patient.pendingCount > 0) parts.push(`${patient.pendingCount} en attente`);
  return <span>{parts.join(" · ") || `${patient.documentCount}`}</span>;
}

/**
 * Le détail des alertes est chiffré : la liste n'affiche que le compteur et le
 * niveau, seules colonnes en clair. Il faut ouvrir le document — et cette
 * ouverture est journalisée.
 */
function VigilanceBadge({ patient }: { patient: PatientListItem }) {
  if (patient.vigilanceCount === 0) return <span className="text-sm text-faint">—</span>;
  return (
    <Badge tone={patient.hasCritical ? "danger" : "caution"}>
      <IconAlert className="size-3.5" />
      {patient.vigilanceCount}
      <span className="sr-only">
        {patient.hasCritical ? " alerte critique" : " point de vigilance"}
      </span>
    </Badge>
  );
}

function MobileCard({ patient }: { patient: PatientListItem }) {
  return (
    <Link href={`/patients/${patient.id}`} className="block">
      <Card className="p-4 transition active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-body">
              {patient.lastName.toUpperCase()} {patient.firstName}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              <DocumentSummary patient={patient} />
            </p>
          </div>
          <VigilanceBadge patient={patient} />
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-3 text-xs">
          {patient.outstandingCents > 0 ? (
            <span className="tabular font-semibold text-flame-700">
              {formatCents(patient.outstandingCents)} à régler
            </span>
          ) : (
            <span className="text-faint">À jour</span>
          )}
          <span className="tabular text-faint">
            {patient.lastActivityAt ? formatDate(patient.lastActivityAt) : "—"}
          </span>
        </div>
      </Card>
    </Link>
  );
}
