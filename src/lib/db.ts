import postgres from "postgres";
import { env } from "./env";

/**
 * Accès base de données.
 *
 * Toute requête métier passe par `withTenant()`, qui ouvre une transaction et
 * y pose le contexte lu par les politiques RLS. Il n'existe volontairement
 * aucun helper « requête sans tenant » exporté pour le métier : la seule
 * échappatoire est `withPrivileged()`, réservée aux deux résolveurs
 * SECURITY DEFINER (sous-domaine, lien magique).
 */

export type Db = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;

type GlobalWithPool = typeof globalThis & { __rylaPool?: Db };

/**
 * Détecte une connexion passant par un pooler en mode transaction
 * (PgBouncer, Supavisor…).
 *
 * Ces poolers ne savent pas rejouer les instructions préparées : postgres.js
 * doit les désactiver, sinon les requêtes échouent de façon erratique dès que
 * la connexion physique change sous les pieds de l'application.
 *
 * `withTenant()` reste correct dans ce mode : `SET LOCAL` est posé à
 * l'intérieur d'une transaction explicite, et le pooler épingle la connexion
 * pour toute sa durée. C'est précisément pourquoi le contexte est transactionnel
 * et non attaché à la session.
 */
export function usesTransactionPooler(url: string): boolean {
  if (process.env.DATABASE_DISABLE_PREPARE === "true") return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.port === "6543" ||
      parsed.hostname.includes("pooler.") ||
      parsed.hostname.includes("pgbouncer")
    );
  } catch {
    return false;
  }
}

export function db(): Db {
  const globalRef = globalThis as GlobalWithPool;
  if (!globalRef.__rylaPool) {
    const url = env.databaseUrl;
    globalRef.__rylaPool = postgres(url, {
      // Un pool large par instance sature la base dès que la plateforme
      // multiplie les instances. Le pooler côté serveur fait le vrai travail.
      // Pas 1 : sous Fluid Compute, une même instance sert des requêtes
      // concurrentes (un praticien et un patient sur son lien, par exemple),
      // et une connexion unique les mettrait inutilement en file.
      max: env.isServerless ? 3 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !usesTransactionPooler(url),
      // Les colonnes bytea reviennent en Buffer, les jsonb en objets.
      transform: { undefined: null },
      onnotice: () => {},
    });
  }
  return globalRef.__rylaPool;
}

/**
 * Contournement — préchauffe la connexion avant la toute première requête
 * réelle d'une Server Action.
 *
 * Bug constaté sur Vercel (Fluid Compute + Next.js 15 + Server Actions liées
 * via `useActionState`, rendues sous `(praticien)/layout.tsx`) : la fonction
 * liée au bouton ne s'exécutait tout simplement jamais — aucune ligne de son
 * corps n'était atteinte, y compris une écriture inconditionnelle placée en
 * tout premier, et sans la moindre erreur observable. L'utilisateur se
 * retrouvait renvoyé sur `/connexion`.
 *
 * Isolé par élimination : le même code, précédé d'une requête base « pour
 * rien » (sans rapport avec la logique métier), s'exécutait normalement à
 * chaque tentative. Sans elle, l'échec était systématique. Avec elle,
 * systématiquement résolu. Le mécanisme exact (probablement une course entre
 * l'établissement de connexion au pooler Supabase et la résolution de
 * l'action côté Next.js/Vercel) n'a pas pu être confirmé au-delà de cette
 * preuve empirique — aucun journal d'exécution n'était accessible depuis cet
 * environnement pour aller plus loin.
 *
 * À retirer si une version ultérieure de Next.js ou du builder Vercel corrige
 * ce point ; en attendant, appeler cette fonction en tout début de toute
 * nouvelle Server Action rendue sous `(praticien)/`.
 */
export async function warmPool(): Promise<void> {
  try {
    await db()`select 1`;
  } catch {
    // Un échec ici n'est pas plus grave qu'un échec de la requête réelle qui
    // suit : on laisse celle-ci produire l'erreur qui compte.
  }
}

// ---------------------------------------------------------------------------
// Garde-fou de démarrage
// ---------------------------------------------------------------------------

let rlsCheck: Promise<void> | undefined;

/**
 * Vérifie que la connexion applicative est réellement soumise au RLS.
 *
 * Trois façons de contourner les politiques sans s'en apercevoir :
 *  1. être superuser ;
 *  2. porter l'attribut BYPASSRLS ;
 *  3. **être propriétaire des tables** — PostgreSQL exempte le propriétaire,
 *     sauf FORCE ROW LEVEL SECURITY.
 *
 * Le troisième cas est le piège des bases managées : le rôle fourni par défaut
 * (`postgres` chez Supabase, l'utilisateur unique d'une base mutualisée) est
 * propriétaire du schéma. Pointer `DATABASE_URL` dessus fait disparaître
 * l'isolation en silence — aucune erreur, juste tous les cabinets visibles.
 *
 * Pourquoi ce contrôle applicatif plutôt que FORCE ROW LEVEL SECURITY : forcer
 * le RLS s'appliquerait aussi aux deux fonctions SECURITY DEFINER dont dépend
 * l'entrée dans un tenant (résolution du sous-domaine et du lien magique), qui
 * s'exécutent avec les droits du propriétaire. Les rendre exemptes demanderait
 * un rôle BYPASSRLS dédié, donc un superuser — indisponible sur une base
 * managée. Le compromis est assumé et vérifié au démarrage.
 */
export function assertRlsEnforced(): Promise<void> {
  if (!rlsCheck) {
    rlsCheck = checkRlsEnforcement(db()).catch((error) => {
      rlsCheck = undefined; // Ne pas mémoriser un échec transitoire de connexion.
      throw error;
    });
  }
  return rlsCheck;
}

/** Le contrôle lui-même, sur une connexion quelconque — testable directement. */
export async function checkRlsEnforcement(sql: Db): Promise<void> {
  const [role] = await sql<
    { name: string; rolsuper: boolean; rolbypassrls: boolean }[]
  >`
    select rolname as name, rolsuper, rolbypassrls
    from pg_roles
    where rolname = current_user
  `;
  if (!role) throw new Error("Rôle de connexion introuvable.");

  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `Le rôle « ${role.name} » contourne le RLS ` +
        `(${role.rolsuper ? "superuser" : "BYPASSRLS"}) : l'isolation ` +
        `multi-tenant serait inopérante. Utilisez le rôle applicatif ` +
        `(ryla_app) dans DATABASE_URL.`,
    );
  }

  const [owned] = await sql<{ tables: string; sample: string | null }[]>`
    select count(*)::text as tables, min(c.relname) as sample
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relforcerowsecurity
      and pg_get_userbyid(c.relowner) = current_user
  `;

  if (owned && Number(owned.tables) > 0) {
    throw new Error(
      `Le rôle « ${role.name} » est propriétaire de ${owned.tables} table(s) ` +
        `du schéma public (par exemple « ${owned.sample} ») : PostgreSQL ` +
        `exempte le propriétaire du RLS, l'isolation multi-tenant serait ` +
        `inopérante. DATABASE_URL doit pointer sur le rôle applicatif ` +
        `(ryla_app), pas sur le rôle qui a joué les migrations.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Contexte de tenant
// ---------------------------------------------------------------------------

export type TenantContext = {
  tenantId: string;
  /** Utilisateur du cabinet à l'origine de l'action, s'il y en a un. */
  actorId?: string | null;
};

/**
 * Exécute `fn` dans une transaction où `app.tenant_id` est positionné.
 *
 * `set_config(..., true)` est l'équivalent de `SET LOCAL` acceptant un
 * paramètre lié : la valeur retombe automatiquement à la fin de la
 * transaction, y compris en cas d'erreur, donc aucun contexte ne peut fuiter
 * sur la connexion suivante du pool.
 */
export async function withTenant<T>(
  context: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  await assertRlsEnforced();
  const result = await db().begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${context.tenantId}, true)`;
    await tx`select set_config('app.actor_id', ${context.actorId ?? ""}, true)`;
    return await fn(tx as Tx);
  });
  return result as T;
}

/**
 * Requête hors contexte de tenant.
 *
 * À n'utiliser que pour les fonctions SECURITY DEFINER du schéma `app`, qui
 * ont une surface volontairement minuscule. Tout le reste passe par
 * `withTenant()`.
 */
export async function withPrivileged<T>(fn: (sql: Db) => Promise<T>): Promise<T> {
  return fn(db());
}
