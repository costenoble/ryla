import { canonicalHash } from "./crypto";
import type { Tx } from "./db";

/**
 * Journal d'audit chaîné.
 *
 * Chaque entrée intègre l'empreinte de la précédente. Supprimer ou réécrire
 * une ligne casse la chaîne de façon détectable — ce qui transforme un simple
 * journal applicatif en élément de preuve, et couvre l'exigence RGPD de
 * traçabilité des accès aux données de santé.
 */

export type AuditActorType = "user" | "patient" | "system" | "anonymous";

export type AuditEntry = {
  actorType: AuditActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

/** Espace de noms arbitraire pour les verrous consultatifs d'audit. */
const ADVISORY_NAMESPACE = 4711;

export async function recordAudit(
  tx: Tx,
  tenantId: string,
  entry: AuditEntry,
): Promise<string> {
  // Sérialise les écritures d'audit du cabinet le temps de la transaction.
  // Sans ce verrou, deux insertions concurrentes liraient le même `prev_hash`
  // et produiraient deux chaînes divergentes.
  await tx`
    select pg_advisory_xact_lock(${ADVISORY_NAMESPACE}::int, hashtext(${tenantId})::int)
  `;

  const [previous] = await tx<{ hash: string }[]>`
    select hash from audit_log
    where tenant_id = ${tenantId}
    order by id desc
    limit 1
  `;

  const occurredAt = new Date();
  const prevHash = previous?.hash ?? null;

  const hash = canonicalHash({
    prevHash,
    tenantId,
    occurredAt: occurredAt.toISOString(),
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    objectType: entry.objectType ?? null,
    objectId: entry.objectId ?? null,
    metadata: entry.metadata ?? {},
  });

  await tx`
    insert into audit_log (
      tenant_id, occurred_at, actor_type, actor_id, actor_label, action,
      object_type, object_id, ip, user_agent, metadata, prev_hash, hash
    ) values (
      ${tenantId}, ${occurredAt}, ${entry.actorType}, ${entry.actorId ?? null},
      ${entry.actorLabel ?? null}, ${entry.action}, ${entry.objectType ?? null},
      ${entry.objectId ?? null}, ${entry.ip ?? null}, ${entry.userAgent ?? null},
      ${tx.json((entry.metadata ?? {}) as never)}, ${prevHash}, ${hash}
    )
  `;

  return hash;
}

export type AuditChainStatus = {
  valid: boolean;
  entries: number;
  head: string | null;
  /** Identifiant de la première entrée incohérente, le cas échéant. */
  brokenAt: string | null;
};

/**
 * Rejoue la chaîne et recalcule chaque empreinte.
 *
 * Appelé à la génération d'un dossier de preuve : on ne se contente pas
 * d'affirmer que le journal est intègre, on le vérifie au moment de le
 * produire.
 */
export async function verifyAuditChain(
  tx: Tx,
  tenantId: string,
): Promise<AuditChainStatus> {
  const rows = await tx<
    {
      id: string;
      occurred_at: Date;
      actor_type: string;
      actor_id: string | null;
      action: string;
      object_type: string | null;
      object_id: string | null;
      metadata: Record<string, unknown>;
      prev_hash: string | null;
      hash: string;
    }[]
  >`
    select id, occurred_at, actor_type, actor_id, action, object_type,
           object_id, metadata, prev_hash, hash
    from audit_log
    where tenant_id = ${tenantId}
    order by id asc
  `;

  let expectedPrev: string | null = null;

  for (const row of rows) {
    const recomputed = canonicalHash({
      prevHash: row.prev_hash,
      tenantId,
      occurredAt: row.occurred_at.toISOString(),
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      objectType: row.object_type,
      objectId: row.object_id,
      metadata: row.metadata ?? {},
    });

    if (row.prev_hash !== expectedPrev || recomputed !== row.hash) {
      return {
        valid: false,
        entries: rows.length,
        head: rows[rows.length - 1]?.hash ?? null,
        brokenAt: String(row.id),
      };
    }
    expectedPrev = row.hash;
  }

  return {
    valid: true,
    entries: rows.length,
    head: expectedPrev,
    brokenAt: null,
  };
}
