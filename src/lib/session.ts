import { generateToken, hashToken } from "./crypto";
import { warmPool, withTenant, type Tx } from "./db";
import { resolveTenantBySlug, type TenantSummary } from "./tenant";

/**
 * Sessions praticien.
 *
 * Le cookie contient `<slug-cabinet>.<jeton>` : le slug permet de résoudre le
 * cabinet — donc de poser le contexte RLS — avant même de chercher la session.
 * Sans lui, la recherche de session devrait s'affranchir du RLS, ce qui
 * rouvrirait exactement la brèche que l'architecture cherche à fermer.
 */

export const SESSION_COOKIE = "ryla_session";
export const SESSION_TTL_DAYS = 12;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: "owner" | "practitioner" | "assistant";
  rpps: string | null;
};

export type AuthenticatedSession = {
  sessionId: string;
  tenant: TenantSummary;
  user: SessionUser;
};

export async function createSession(
  tx: Tx,
  params: {
    tenantId: string;
    tenantSlug: string;
    userId: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const rawToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await tx`
    insert into sessions (tenant_id, user_id, token_hash, ip, user_agent, expires_at)
    values (${params.tenantId}, ${params.userId}, ${hashToken(rawToken)},
            ${params.ip ?? null}, ${params.userAgent ?? null}, ${expiresAt})
  `;

  return { cookieValue: `${params.tenantSlug}.${rawToken}`, expiresAt };
}

function splitCookie(value: string): { slug: string; token: string } | null {
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const slug = value.slice(0, separator);
  const token = value.slice(separator + 1);
  return slug && token ? { slug, token } : null;
}

export async function loadSession(
  cookieValue: string | undefined,
): Promise<AuthenticatedSession | null> {
  if (!cookieValue) return null;
  const parts = splitCookie(cookieValue);
  if (!parts) return null;

  // Contournement délibéré — voir warmPool() dans db.ts pour le détail et les
  // preuves : sur Vercel, la première requête d'une Server Action liée à
  // useActionState sous (praticien)/layout.tsx échouait systématiquement (la
  // fonction ne s'exécutait jamais, sans erreur observable) tant qu'aucune
  // requête base « pour rien » ne la précédait. Cet appel absorbe ce problème.
  await warmPool();

  const tenant = await resolveTenantBySlug(parts.slug);
  if (!tenant) return null;

  return withTenant({ tenantId: tenant.id }, async (tx) => {
    const [row] = await tx<
      {
        session_id: string;
        user_id: string;
        email: string;
        full_name: string;
        role: SessionUser["role"];
        rpps: string | null;
      }[]
    >`
      select s.id as session_id, u.id as user_id, u.email, u.full_name, u.role, u.rpps
      from sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${hashToken(parts.token)}
        and s.revoked_at is null
        and s.expires_at > now()
        and u.is_active
      limit 1
    `;

    if (!row) return null;

    return {
      sessionId: row.session_id,
      tenant,
      user: {
        id: row.user_id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        rpps: row.rpps,
      },
    } satisfies AuthenticatedSession;
  });
}

export async function revokeSession(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  const parts = splitCookie(cookieValue);
  if (!parts) return;

  const tenant = await resolveTenantBySlug(parts.slug);
  if (!tenant) return;

  await withTenant({ tenantId: tenant.id }, async (tx) => {
    await tx`
      update sessions set revoked_at = now()
      where token_hash = ${hashToken(parts.token)} and revoked_at is null
    `;
  });
}
