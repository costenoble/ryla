"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { currentHost, requestContext } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { env } from "@/lib/env";
import {
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
  throttleMessage,
} from "@/lib/login-throttle";
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
    // Avant toute vérification de mot de passe : un compteur qui ne se
    // déclencherait qu'après avoir comparé l'empreinte laisserait la porte
    // ouverte au coût processeur de scrypt, qui est précisément ce qu'on ne
    // veut pas offrir à un attaquant.
    const throttle = await checkLoginThrottle(tx, { email, ip: client.ip });
    if (!throttle.allowed) {
      await recordAudit(tx, tenant.id, {
        actorType: "anonymous",
        action: "auth.login_blocked",
        objectType: "user",
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { email, scope: throttle.scope },
      });
      return { blocked: throttleMessage(throttle) } as const;
    }

    const [user] = await tx<
      { id: string; password_hash: string | null; full_name: string }[]
    >`
      select id, password_hash, full_name
      from users
      where lower(email) = lower(${email}) and is_active
      limit 1
    `;

    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      await recordLoginFailure(tx, tenant.id, { email, ip: client.ip });
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

    // Les erreurs de frappe d'un praticien légitime ne doivent pas le laisser
    // à un essai du blocage pour le quart d'heure suivant.
    await clearLoginFailures(tx, email);

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
  if ("blocked" in result) {
    return { error: result.blocked };
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
