import type { Tx } from "./db";

/**
 * Limitation de débit sur la connexion.
 *
 * Fenêtre glissante, deux compteurs indépendants :
 *   • par (cabinet, email) — l'acharnement sur un compte ;
 *   • par (cabinet, IP)    — la pulvérisation, qui essaie un même mot de passe
 *                            sur beaucoup de comptes et reste donc invisible
 *                            du premier compteur.
 *
 * Le verrou s'applique avant toute vérification de mot de passe, et il compte
 * les échecs sur l'email *saisi*, existant ou non. Ne compter que les comptes
 * réels ferait du silence du compteur un oracle : « pas de blocage » se lirait
 * « ce compte n'existe pas ».
 *
 * La fenêtre est glissante et non un blocage à durée fixe : le verrou se lève
 * dès que la plus ancienne tentative sort de la fenêtre, ce qui évite qu'un
 * praticien qui s'est trompé six fois à midi reste dehors jusqu'au soir.
 */

export const THROTTLE_WINDOW_MINUTES = 15;

/**
 * Huit essais par email : au-delà, ce n'est plus quelqu'un qui hésite entre
 * ses deux mots de passe habituels.
 */
export const MAX_FAILURES_PER_EMAIL = 8;

/**
 * Vingt-cinq par IP. Volontairement large : un cabinet sort derrière une seule
 * adresse publique, et plusieurs personnes s'y connectent le matin à la même
 * minute. Trop bas, ce compteur mettrait tout un cabinet dehors.
 */
export const MAX_FAILURES_PER_IP = 25;

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; scope: "email" | "ip" };

/**
 * Décision pure, à partir des compteurs déjà lus. Isolée de la base pour être
 * testable sans elle — c'est la partie qui doit rester juste.
 */
export function decideThrottle(params: {
  emailFailures: number;
  ipFailures: number;
  /** Plus ancienne tentative encore dans la fenêtre, par périmètre. */
  oldestEmailAttempt: Date | null;
  oldestIpAttempt: Date | null;
  now?: Date;
  windowMinutes?: number;
}): ThrottleDecision {
  const now = params.now ?? new Date();
  const windowMs = (params.windowMinutes ?? THROTTLE_WINDOW_MINUTES) * 60_000;

  const retryAfter = (oldest: Date | null): number => {
    if (!oldest) return Math.ceil(windowMs / 1000);
    const freeAt = oldest.getTime() + windowMs;
    // Au moins une seconde : renvoyer 0 laisserait croire que c'est ouvert.
    return Math.max(1, Math.ceil((freeAt - now.getTime()) / 1000));
  };

  if (params.emailFailures >= MAX_FAILURES_PER_EMAIL) {
    return {
      allowed: false,
      scope: "email",
      retryAfterSeconds: retryAfter(params.oldestEmailAttempt),
    };
  }

  if (params.ipFailures >= MAX_FAILURES_PER_IP) {
    return {
      allowed: false,
      scope: "ip",
      retryAfterSeconds: retryAfter(params.oldestIpAttempt),
    };
  }

  return { allowed: true };
}

/** Message affiché au visiteur bloqué. */
export function throttleMessage(decision: Extract<ThrottleDecision, { allowed: false }>): string {
  const minutes = Math.ceil(decision.retryAfterSeconds / 60);
  return (
    `Trop de tentatives de connexion. Réessayez dans ${minutes} minute` +
    `${minutes > 1 ? "s" : ""}.`
  );
}

// ---------------------------------------------------------------------------
// Accès base
// ---------------------------------------------------------------------------

/**
 * Lit les deux compteurs sur la fenêtre courante.
 *
 * Aucun filtrage par `tenant_id` : le RLS s'en charge, comme partout ailleurs.
 */
export async function checkLoginThrottle(
  tx: Tx,
  params: { email: string; ip: string | null; now?: Date },
): Promise<ThrottleDecision> {
  const email = params.email.trim().toLowerCase();

  const [row] = await tx<
    {
      email_failures: string;
      ip_failures: string;
      oldest_email: Date | null;
      oldest_ip: Date | null;
    }[]
  >`
    select
      count(*) filter (where email = ${email})::text as email_failures,
      count(*) filter (where ${params.ip}::inet is not null and ip = ${params.ip}::inet)::text
        as ip_failures,
      min(attempted_at) filter (where email = ${email}) as oldest_email,
      min(attempted_at) filter (where ${params.ip}::inet is not null and ip = ${params.ip}::inet)
        as oldest_ip
    from login_attempts
    where attempted_at > now() - (${THROTTLE_WINDOW_MINUTES} || ' minutes')::interval
  `;

  return decideThrottle({
    emailFailures: Number(row?.email_failures ?? 0),
    ipFailures: Number(row?.ip_failures ?? 0),
    oldestEmailAttempt: row?.oldest_email ?? null,
    oldestIpAttempt: row?.oldest_ip ?? null,
    now: params.now,
  });
}

/**
 * Enregistre un échec, et purge au passage ce qui est sorti de la fenêtre.
 *
 * La purge est faite ici plutôt que par un ordonnanceur : cette table n'est
 * pas un journal — le journal, c'est `audit_log`, qui garde la trace complète
 * des échecs. Celle-ci n'a besoin de retenir que la fenêtre courante, et la
 * laisser grossir n'apporterait rien qu'une dette de ménage.
 */
export async function recordLoginFailure(
  tx: Tx,
  tenantId: string,
  params: { email: string; ip: string | null },
): Promise<void> {
  await tx`
    insert into login_attempts (tenant_id, email, ip)
    values (${tenantId}, ${params.email.trim().toLowerCase()}, ${params.ip}::inet)
  `;

  await tx`
    delete from login_attempts
    where attempted_at < now() - (${THROTTLE_WINDOW_MINUTES * 4} || ' minutes')::interval
  `;
}

/**
 * Efface les échecs d'un email après une connexion réussie.
 *
 * Sans ça, sept erreurs de frappe suivies d'une connexion réussie laisseraient
 * le compte à un essai du blocage pour le quart d'heure suivant.
 */
export async function clearLoginFailures(tx: Tx, email: string): Promise<void> {
  await tx`
    delete from login_attempts where email = ${email.trim().toLowerCase()}
  `;
}
