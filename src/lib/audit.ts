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
  /** Faux quand seule la fin de la chaîne a été rejouée. */
  complete: boolean;
};

/**
 * Nombre d'entrées rejouées par défaut.
 *
 * La vérification intégrale relisait tout le journal du cabinet et recalculait
 * chaque empreinte — à chaque signature. Un cabinet à cinquante patients par
 * jour produit de l'ordre de cinquante mille entrées par an : la signature
 * d'un patient aurait fini par rejouer cinquante mille SHA-256 pendant qu'il
 * attend devant son écran, et la transaction avec.
 *
 * Rejouer les dernières entrées suffit à ce qu'on cherche ici : constater que
 * la tête de chaîne est cohérente au moment où on la scelle dans le faisceau.
 * Une falsification ancienne reste détectable — elle casse le maillon suivant,
 * et de proche en proche jusqu'à la tête — mais elle se démontre par une
 * vérification intégrale, qui a sa place dans un contrôle d'audit, pas dans le
 * chemin d'un patient qui signe.
 */
export const CHAIN_VERIFY_WINDOW = 200;

/**
 * Rejoue la chaîne et recalcule chaque empreinte.
 *
 * Appelé à la génération d'un dossier de preuve : on ne se contente pas
 * d'affirmer que le journal est intègre, on le vérifie au moment de le
 * produire.
 *
 * `limit` borne le nombre d'entrées rejouées, depuis la fin. Passer `null`
 * rejoue tout — c'est ce que fait un contrôle d'audit, et ce que font les
 * tests.
 */
export async function verifyAuditChain(
  tx: Tx,
  tenantId: string,
  options: { limit?: number | null } = {},
): Promise<AuditChainStatus> {
  const limit = options.limit === undefined ? CHAIN_VERIFY_WINDOW : options.limit;

  if (limit !== null) return verifyTail(tx, tenantId, limit);

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
        complete: true,
      };
    }
    expectedPrev = row.hash;
  }

  return {
    valid: true,
    entries: rows.length,
    head: expectedPrev,
    brokenAt: null,
    complete: true,
  };
}

/**
 * Vérifie la fin de la chaîne, sans la relire entièrement.
 *
 * Le premier maillon de la fenêtre n'a pas de prédécesseur connu : on ne peut
 * pas vérifier son `prev_hash`, seulement que son empreinte correspond à son
 * contenu. À partir du deuxième, le chaînage est contrôlé normalement.
 */
async function verifyTail(
  tx: Tx,
  tenantId: string,
  limit: number,
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
    order by id desc
    limit ${limit}
  `;

  const window = rows.reverse();
  let expectedPrev: string | null = null;

  for (const [index, row] of window.entries()) {
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

    const chainBroken = index > 0 && row.prev_hash !== expectedPrev;
    if (chainBroken || recomputed !== row.hash) {
      return {
        valid: false,
        entries: window.length,
        head: window[window.length - 1]?.hash ?? null,
        brokenAt: String(row.id),
        complete: false,
      };
    }
    expectedPrev = row.hash;
  }

  return {
    valid: true,
    entries: window.length,
    head: expectedPrev,
    brokenAt: null,
    complete: window.length < limit,
  };
}
