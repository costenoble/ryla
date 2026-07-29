import type { Metadata } from "next";
import Link from "next/link";
import { IconAlert, IconChevronRight, IconFolder } from "@/components/icons";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import { Badge, Card, cx, EmptyState, PageHeader, type BadgeTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listSubmissions, type SubmissionListItem } from "@/lib/repos/submissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dossiers" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "brand" },
  in_progress: { label: "En cours", tone: "caution" },
  completed: { label: "Complété", tone: "brand" },
  signed: { label: "Signé", tone: "positive" },
  expired: { label: "Expiré", tone: "neutral" },
  revoked: { label: "Révoqué", tone: "neutral" },
};

export default async function DossiersPage() {
  const session = await requireSession();
  const items = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    listSubmissions(tx),
  );

  const critical = items.filter((item) => item.vigilanceMaxLevel === "critical").length;

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Cabinet"
          title="Dossiers"
          description={
            items.length === 0
              ? "Les questionnaires et consentements envoyés apparaîtront ici."
              : `${items.length} dossier${items.length > 1 ? "s" : ""}${
                  critical > 0
                    ? ` · ${critical} avec un point de vigilance critique`
                    : ""
                }`
          }
        />
      </FadeUp>

      {items.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={<IconFolder className="size-5" />}
            title="Aucun dossier pour l'instant"
            description="Envoyez un questionnaire depuis un modèle pour créer votre premier dossier."
          />
        </FadeUp>
      ) : (
        <>
          {/* Cartes sur mobile : un tableau à cinq colonnes y devient illisible
              et provoque un défilement horizontal. */}
          <Stagger className="space-y-3 lg:hidden">
            {items.map((item) => (
              <StaggerItem key={item.id}>
                <MobileCard item={item} />
              </StaggerItem>
            ))}
          </Stagger>

          <FadeUp delay={0.05} className="hidden lg:block">
            <Card className="overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/70">
                    <Th>Patient</Th>
                    <Th>Document</Th>
                    <Th>Statut</Th>
                    <Th>Vigilance</Th>
                    <Th className="text-right">Créé le</Th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((item) => (
                    <tr key={item.id} className="group transition hover:bg-canvas/60">
                      <td className="px-5 py-3.5">
                        {/* Le lien porte sur le nom plutôt que sur la ligne
                            entière : un `<tr>` ne se positionne pas de façon
                            fiable, et l'astuce du calque absolu casserait la
                            sélection de texte dans les autres cellules. */}
                        <Link
                          href={`/dossiers/${item.id}`}
                          className="font-semibold text-body transition group-hover:text-brand-700"
                        >
                          {item.patientName ?? "Patient non rattaché"}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-muted">{item.templateTitle}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={STATUS[item.status]?.tone ?? "neutral"}>
                          {STATUS[item.status]?.label ?? item.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Vigilance item={item} />
                      </td>
                      <td className="tabular px-5 py-3.5 text-right text-muted">
                        {formatDate(item.createdAt)}
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

/**
 * Le détail des alertes est chiffré : la liste n'affiche que le compteur et le
 * niveau, seules colonnes en clair. Il faut ouvrir le dossier — et cette
 * ouverture est journalisée.
 */
function Vigilance({ item }: { item: SubmissionListItem }) {
  if (item.vigilanceCount === 0) {
    return <span className="text-sm text-faint">—</span>;
  }
  const critical = item.vigilanceMaxLevel === "critical";

  return (
    <Badge tone={critical ? "danger" : "caution"}>
      <IconAlert className="size-3.5" />
      {item.vigilanceCount}
      <span className="sr-only">
        {critical ? " alerte critique" : " point de vigilance"}
      </span>
    </Badge>
  );
}

function MobileCard({ item }: { item: SubmissionListItem }) {
  return (
    <Link href={`/dossiers/${item.id}`} className="block">
      <Card className="p-4 transition active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-body">
              {item.patientName ?? "Patient non rattaché"}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted">{item.templateTitle}</p>
          </div>
          <Vigilance item={item} />
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <Badge tone={STATUS[item.status]?.tone ?? "neutral"}>
            {STATUS[item.status]?.label ?? item.status}
          </Badge>
          <span className="tabular text-xs text-faint">
            {formatDate(item.createdAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
