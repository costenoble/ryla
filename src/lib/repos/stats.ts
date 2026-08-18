import type { Tx } from "../db";

/**
 * Indicateurs du tableau de bord.
 *
 * Aucun filtrage par tenant dans ces requêtes : le RLS s'en charge, comme
 * partout ailleurs. Les compteurs de vigilance s'appuient sur les colonnes en
 * clair (`vigilance_count`, `vigilance_max_level`) — le détail des alertes
 * reste chiffré et n'est jamais agrégé ici.
 */

export type ActivityEntry = {
  id: string;
  action: string;
  actorLabel: string | null;
  actorType: string;
  objectType: string | null;
  objectId: string | null;
  occurredAt: Date;
};

export type DashboardStats = {
  submissionsTotal: number;
  signedCount: number;
  pendingCount: number;
  draftCount: number;
  completionRate: number;
  criticalCount: number;
  vigilanceCount: number;
  patientCount: number;
  templateCount: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesInReflection: number;
  outstandingChargeCents: number;
  /** Signatures par jour sur les 14 derniers jours, pour la courbe. */
  series: { date: string; count: number }[];
  activity: ActivityEntry[];
};

export async function getDashboardStats(tx: Tx): Promise<DashboardStats> {
  const [submissions] = await tx<
    {
      total: string;
      signed: string;
      pending: string;
      draft: string;
      critical: string;
      vigilance: string;
    }[]
  >`
    select
      count(*)::text as total,
      count(*) filter (where status = 'signed')::text as signed,
      count(*) filter (where status in ('sent', 'in_progress'))::text as pending,
      count(*) filter (where status = 'draft')::text as draft,
      count(*) filter (where vigilance_max_level = 'critical')::text as critical,
      coalesce(sum(vigilance_count), 0)::text as vigilance
    from submissions
  `;

  const [counts] = await tx<{ patients: string; templates: string }[]>`
    select
      (select count(*) from patients where deleted_at is null)::text as patients,
      (select count(*) from form_templates where archived_at is null)::text as templates
  `;

  const [quotes] = await tx<
    {
      sent: string;
      accepted: string;
      reflection: string;
      outstanding: string;
    }[]
  >`
    select
      count(*) filter (where status = 'sent')::text as sent,
      count(*) filter (where status = 'accepted')::text as accepted,
      count(*) filter (
        where status = 'sent'
          and reflection_period_days > 0
          and reflection_ends_at > now()
      )::text as reflection,
      coalesce(sum(remaining_charge_cents) filter (where status in ('sent', 'accepted')), 0)::text
        as outstanding
    from quotes
  `;

  // Série sur 14 jours, trous compris : sans `generate_series`, un jour sans
  // signature disparaîtrait et la courbe mentirait sur le rythme réel.
  const series = await tx<{ date: string; count: string }[]>`
    select to_char(d.day, 'YYYY-MM-DD') as date,
           count(s.id)::text as count
    from generate_series(
      current_date - interval '13 days', current_date, interval '1 day'
    ) as d(day)
    left join submissions s
      on s.signed_at >= d.day and s.signed_at < d.day + interval '1 day'
    group by d.day
    order by d.day
  `;

  const activity = await tx<
    {
      id: string;
      action: string;
      actor_label: string | null;
      actor_type: string;
      object_type: string | null;
      object_id: string | null;
      occurred_at: Date;
    }[]
  >`
    select id::text, action, actor_label, actor_type, object_type,
           object_id::text, occurred_at
    from audit_log
    order by id desc
    limit 8
  `;

  const total = Number(submissions?.total ?? 0);
  const signed = Number(submissions?.signed ?? 0);
  const draft = Number(submissions?.draft ?? 0);
  // Un brouillon n'a jamais été envoyé : l'inclure ferait chuter le taux sans
  // que le cabinet y soit pour quelque chose.
  const dispatched = total - draft;

  return {
    submissionsTotal: total,
    signedCount: signed,
    pendingCount: Number(submissions?.pending ?? 0),
    draftCount: draft,
    completionRate: dispatched > 0 ? (signed / dispatched) * 100 : 0,
    criticalCount: Number(submissions?.critical ?? 0),
    vigilanceCount: Number(submissions?.vigilance ?? 0),
    patientCount: Number(counts?.patients ?? 0),
    templateCount: Number(counts?.templates ?? 0),
    quotesSent: Number(quotes?.sent ?? 0),
    quotesAccepted: Number(quotes?.accepted ?? 0),
    quotesInReflection: Number(quotes?.reflection ?? 0),
    outstandingChargeCents: Number(quotes?.outstanding ?? 0),
    series: series.map((row) => ({ date: row.date, count: Number(row.count) })),
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      actorLabel: row.actor_label,
      actorType: row.actor_type,
      objectType: row.object_type,
      objectId: row.object_id,
      occurredAt: row.occurred_at,
    })),
  };
}

/** Libellés lisibles des actions journalisées. */
export const ACTION_LABELS: Record<string, string> = {
  "submission.sent": "Document envoyé au patient",
  "submission.opened": "Lien ouvert par le patient",
  "submission.signed": "Document signé",
  "submission.viewed": "Dossier consulté",
  "document.downloaded": "Document téléchargé",
  "auth.login": "Connexion",
  "auth.login_failed": "Échec de connexion",
  "auth.login_blocked": "Connexion bloquée (trop de tentatives)",
  "submission.link_reissued": "Lien renvoyé au patient",
  "notification.sent": "Notification envoyée",
  "tenant.settings_updated": "Réglages du cabinet modifiés",
};
