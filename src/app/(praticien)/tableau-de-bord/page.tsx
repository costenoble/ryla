import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { ACTION_LABELS, getDashboardStats } from "@/lib/repos/stats";
import { DashboardView } from "./DashboardView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tableau de bord" };

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `il y a ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86_400);
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const session = await requireSession();
  const stats = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    getDashboardStats(tx),
  );

  return (
    <DashboardView
      data={{
        practitionerName: session.user.fullName,
        cabinetName: session.tenant.name,
        signedCount: stats.signedCount,
        pendingCount: stats.pendingCount,
        completionRate: stats.completionRate,
        vigilanceCount: stats.vigilanceCount,
        criticalCount: stats.criticalCount,
        patientCount: stats.patientCount,
        templateCount: stats.templateCount,
        quotesSent: stats.quotesSent,
        quotesAccepted: stats.quotesAccepted,
        quotesInReflection: stats.quotesInReflection,
        outstandingChargeCents: stats.outstandingChargeCents,
        series: stats.series,
        // Les objets Date ne traversent pas la frontière serveur/client : on
        // formate ici, où l'on connaît déjà la locale attendue.
        activity: stats.activity.map((entry) => ({
          id: entry.id,
          label: ACTION_LABELS[entry.action] ?? entry.action,
          actor: entry.actorLabel ?? (entry.actorType === "patient" ? "Patient" : "Système"),
          objectId: entry.objectId,
          objectType: entry.objectType,
          when: relativeTime(entry.occurredAt),
        })),
      }}
    />
  );
}
