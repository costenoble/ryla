import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadSession, SESSION_COOKIE, type AuthenticatedSession } from "./session";

/**
 * Couche d'authentification côté Next.js.
 *
 * Séparée de `session.ts` pour que la logique de session reste testable sans
 * embarquer `next/headers`.
 */

export async function currentSession(): Promise<AuthenticatedSession | null> {
  const store = await cookies();
  return loadSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await currentSession();
  if (!session) redirect("/connexion");
  return session;
}

export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

/**
 * Adresse IP et user-agent de la requête.
 *
 * Éléments du faisceau de preuves, et non de la sécurité : derrière un proxy,
 * `x-forwarded-for` est déclaratif. On prend la première adresse de la chaîne
 * et on assume qu'elle vaut indice, pas certitude.
 */
export async function requestContext(): Promise<RequestContext> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    store.get("x-real-ip") ||
    null;

  return { ip, userAgent: store.get("user-agent") };
}

export async function currentHost(): Promise<string | null> {
  const store = await headers();
  return store.get("x-forwarded-host") ?? store.get("host");
}

export { SESSION_COOKIE };
