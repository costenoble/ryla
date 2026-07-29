"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { currentHost, requestContext } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import {
  createSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "@/lib/session";
import { resolveTenantBySlug, tenantSlugFromHost } from "@/lib/tenant";

export type LoginState = { error: string | null };

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const submittedSlug = String(formData.get("cabinet") ?? "")
    .trim()
    .toLowerCase();

  // En production, le cabinet vient du sous-domaine. Le champ du formulaire
  // n'est utilisé qu'en local, où il n'y a pas de sous-domaine à lire.
  const slug = tenantSlugFromHost(await currentHost()) ?? submittedSlug;

  if (!slug || !email || !password) {
    return { error: "Renseignez le cabinet, votre email et votre mot de passe." };
  }

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    // Message volontairement identique à celui d'un mauvais mot de passe :
    // inutile de confirmer à un inconnu qu'un cabinet existe.
    return { error: "Identifiants incorrects." };
  }

  const client = await requestContext();

  const result = await withTenant({ tenantId: tenant.id }, async (tx) => {
    const [user] = await tx<
      { id: string; password_hash: string | null; full_name: string }[]
    >`
      select id, password_hash, full_name
      from users
      where lower(email) = lower(${email}) and is_active
      limit 1
    `;

    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      await recordAudit(tx, tenant.id, {
        actorType: "anonymous",
        action: "auth.login_failed",
        objectType: "user",
        ip: client.ip,
        userAgent: client.userAgent,
        // L'email saisi est journalisé : une série d'échecs sur une même
        // adresse est le signal qu'on veut voir passer.
        metadata: { email },
      });
      return null;
    }

    const session = await createSession(tx, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      userId: user.id,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    await tx`update users set last_login_at = now() where id = ${user.id}`;

    await recordAudit(tx, tenant.id, {
      actorType: "user",
      actorId: user.id,
      actorLabel: user.full_name,
      action: "auth.login",
      objectType: "user",
      objectId: user.id,
      ip: client.ip,
      userAgent: client.userAgent,
    });

    return session;
  });

  if (!result) {
    return { error: "Identifiants incorrects." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, result.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86_400,
  });

  redirect("/tableau-de-bord");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  await revokeSession(cookie);
  store.delete(SESSION_COOKIE);
  redirect("/connexion");
}
