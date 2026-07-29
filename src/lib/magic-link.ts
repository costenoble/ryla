import { generateToken, hashToken } from "./crypto";
import { withPrivileged, type Tx } from "./db";
import { env } from "./env";

/**
 * Liens magiques du portail patient.
 *
 * Aucun compte patient : chaque friction ajoutée au parcours coûte de la
 * complétion, et un mot de passe de plus n'apporte ici aucune sécurité réelle.
 * Le lien porte un secret de 256 bits, expire, et ne circule que par un canal
 * qui ne contient aucune donnée de santé (cf. notifications.ts).
 *
 * Le jeton en clair n'existe qu'une fois, dans l'email. La base ne stocke que
 * son HMAC : une fuite de `access_tokens` ne permet de rejouer aucun lien.
 */

export type TokenAudience = "patient" | "legal_representative" | "practitioner";

export type IssuedToken = {
  tokenId: string;
  /** À n'utiliser que pour construire l'URL. Jamais journalisé, jamais stocké. */
  rawToken: string;
  url: string;
  expiresAt: Date;
};

export async function issueAccessToken(
  tx: Tx,
  params: {
    tenantId: string;
    tenantSlug: string;
    submissionId: string;
    audience?: TokenAudience;
    ttlHours?: number;
    maxUses?: number;
  },
): Promise<IssuedToken> {
  const rawToken = generateToken();
  const ttlHours = params.ttlHours ?? env.magicLinkTtlHours;
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

  const [row] = await tx<{ id: string }[]>`
    insert into access_tokens (
      tenant_id, submission_id, token_hash, audience, expires_at, max_uses
    ) values (
      ${params.tenantId}, ${params.submissionId}, ${hashToken(rawToken)},
      ${params.audience ?? "patient"}, ${expiresAt}, ${params.maxUses ?? 0}
    )
    returning id
  `;

  if (!row) throw new Error("Création du lien d'accès impossible.");

  return {
    tokenId: row.id,
    rawToken,
    url: buildPortalUrl(params.tenantSlug, rawToken),
    expiresAt,
  };
}

export function buildPortalUrl(tenantSlug: string, rawToken: string): string {
  const base = new URL(env.appBaseUrl);
  // En production, chaque cabinet a son sous-domaine (branding, mentions
  // légales et DPO propres). En local on reste sur l'hôte courant.
  if (!base.hostname.includes("localhost") && !base.hostname.startsWith("127.")) {
    base.hostname = `${tenantSlug}.${base.hostname.replace(/^www\./, "")}`;
  }
  base.pathname = `/p/${rawToken}`;
  return base.toString();
}

export type ResolvedToken = {
  tokenId: string;
  tenantId: string;
  submissionId: string;
  audience: TokenAudience;
  expiresAt: Date;
  revokedAt: Date | null;
  usedCount: number;
  maxUses: number;
};

export type TokenResolution =
  | { ok: true; token: ResolvedToken }
  | { ok: false; reason: "unknown" | "expired" | "revoked" | "exhausted" };

/**
 * Résout un jeton *avant* de connaître le cabinet.
 *
 * Passe par la fonction SECURITY DEFINER `app.resolve_access_token`, dont la
 * surface se limite à cette recherche sur clé exacte : c'est la seule façon
 * d'entrer dans un tenant sans en connaître l'identifiant, et elle ne renvoie
 * aucune donnée de santé.
 */
export async function resolveAccessToken(rawToken: string): Promise<TokenResolution> {
  const rows = await withPrivileged(
    (sql) => sql<
      {
        token_id: string;
        tenant_id: string;
        submission_id: string;
        audience: TokenAudience;
        expires_at: Date;
        revoked_at: Date | null;
        used_count: number;
        max_uses: number;
      }[]
    >`select * from app.resolve_access_token(${hashToken(rawToken)})`,
  );

  const row = rows[0];
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return { ok: false, reason: "exhausted" };
  }

  return {
    ok: true,
    token: {
      tokenId: row.token_id,
      tenantId: row.tenant_id,
      submissionId: row.submission_id,
      audience: row.audience,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      usedCount: row.used_count,
      maxUses: row.max_uses,
    },
  };
}

export async function markTokenUsed(tx: Tx, tokenId: string): Promise<void> {
  await tx`
    update access_tokens
    set used_count = used_count + 1,
        first_used_at = coalesce(first_used_at, now()),
        last_used_at = now()
    where id = ${tokenId}
  `;
}

export async function revokeTokensForSubmission(
  tx: Tx,
  submissionId: string,
): Promise<void> {
  await tx`
    update access_tokens
    set revoked_at = now()
    where submission_id = ${submissionId} and revoked_at is null
  `;
}
