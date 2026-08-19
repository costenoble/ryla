import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, type Capability } from "./permissions";
import { loadSession, SESSION_COOKIE, type AuthenticatedSession } from "./session";

/**
 * Couche d'authentification côté Next.js.
 *
 * Séparée de `session.ts` pour que la logique de session reste testable sans
 * embarquer `next/headers`.
 *
 * `currentSession()` est appelée plusieurs fois par requête : par le layout
 * praticien, par la page, puis par l'action serveur qu'elle déclenche.
 * `cache()` mémorise le résultat pour la durée de la requête, ce qui ramène
 * trois allers-retours base à un seul.
 *
 * C'est une optimisation, pas un correctif : la mémorisation ne franchit pas
 * les frontières de requête, et n'aide donc en rien lorsqu'un rendu est
 * déclenché en arrière-plan hors du contexte de cookies (cf. le commentaire
 * sur `revalidatePath` dans `lib/actions/dossiers.ts`).
 */
export const currentSession = cache(
  async (): Promise<AuthenticatedSession | null> => {
    const store = await cookies();
    return loadSession(store.get(SESSION_COOKIE)?.value);
  },
);

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await currentSession();
  if (!session) redirect("/connexion");
  return session;
}

/**
 * Session assortie d'un droit.
 *
 * Le contrôle est fait ici, côté serveur, et non par l'affichage : masquer un
 * bouton n'a jamais protégé une donnée. Une page appelle cette fonction avec le
 * droit qu'elle exige, et une action serveur fait de même — les deux chemins
 * sont indépendants, et un lien collé dans la barre d'adresse ne contourne rien.
 */
export async function requireCapability(
  capability: Capability,
): Promise<AuthenticatedSession> {
  const session = await requireSession();
  if (!can(session.user.role, capability)) {
    // Redirection plutôt qu'exception : dans une page, une exception donne un
    // écran d'erreur générique ; dans une Server Action, `redirect()` produit
    // une réponse que le client suit. Le même appel convient aux deux, et la
    // personne arrive sur une explication au lieu d'un mur.
    redirect(`/acces-refuse?droit=${encodeURIComponent(capability)}`);
  }
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
