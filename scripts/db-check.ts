/**
 * Diagnostic de la connexion base.
 *
 * À lancer après avoir changé `DATABASE_URL` — passage sur Supabase, sur OVH,
 * sur une nouvelle instance. Vérifie ce qui, si c'est mal configuré, ne
 * produit aucune erreur visible mais fait disparaître l'isolation entre
 * cabinets.
 *
 *   npx tsx scripts/db-check.ts
 */
import { loadEnv } from "./load-env";

loadEnv();

import { unwrapDek } from "../src/lib/crypto";
import { checkRlsEnforcement, db, usesTransactionPooler, withTenant } from "../src/lib/db";
import { env } from "../src/lib/env";

const ok = (text: string) => console.log(`  ✓ ${text}`);
const warn = (text: string) => console.log(`  ! ${text}`);
const ko = (text: string) => {
  console.log(`  ✗ ${text}`);
  process.exitCode = 1;
};

try {
  const url = new URL(env.databaseUrl);
  console.log(`\nCible : ${url.username}@${url.host}${url.pathname}\n`);

  const sql = db();

  const [version] = await sql<{ server_version: string }[]>`show server_version`;
  ok(`PostgreSQL ${version?.server_version ?? "?"}`);

  if (usesTransactionPooler(env.databaseUrl)) {
    ok("pooler en mode transaction détecté — instructions préparées désactivées");
  }

  // --- Le contrôle qui compte ---------------------------------------------
  try {
    await checkRlsEnforcement(sql);
    ok("le rôle applicatif est bien soumis au RLS");
  } catch (error) {
    ko(error instanceof Error ? error.message : String(error));
  }

  // --- Couverture des politiques ------------------------------------------
  const tables = await sql<{ name: string; rls: boolean; policies: number }[]>`
    select c.relname as name,
           c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_migrations'
    order by c.relname
  `;

  if (tables.length === 0) {
    ko("aucune table dans le schéma public — les migrations n'ont pas été jouées");
  } else {
    const unprotected = tables.filter((t) => !t.rls || t.policies === 0);
    if (unprotected.length === 0) {
      ok(`${tables.length} tables, toutes avec RLS et au moins une politique`);
    } else {
      ko(`sans protection : ${unprotected.map((t) => t.name).join(", ")}`);
    }
  }

  // --- Privilèges attendus -------------------------------------------------
  const [audit] = await sql<{ can_update: boolean; can_delete: boolean }[]>`
    select has_table_privilege(current_user, 'audit_log', 'UPDATE') as can_update,
           has_table_privilege(current_user, 'audit_log', 'DELETE') as can_delete
  `;
  audit && !audit.can_update && !audit.can_delete
    ? ok("le journal d'audit est en append-only")
    : ko("le journal d'audit est modifiable — revoyez les REVOKE de 0002_rls.sql");

  const [tenantPrivileges] = await sql<{ can_insert: boolean; can_delete: boolean }[]>`
    select has_table_privilege(current_user, 'tenants', 'INSERT') as can_insert,
           has_table_privilege(current_user, 'tenants', 'DELETE') as can_delete
  `;
  tenantPrivileges && !tenantPrivileges.can_insert && !tenantPrivileges.can_delete
    ? ok("la création de cabinet passe uniquement par app.provision_tenant()")
    : warn("le rôle applicatif peut créer ou supprimer un cabinet directement");

  // --- Clés de chiffrement des cabinets ------------------------------------
  //
  // Sans ce contrôle, une KEK qui ne correspond pas ne se manifeste qu'à la
  // première manipulation de données de santé — une signature de patient, au
  // pire moment. Tout le reste (connexion, listes, navigation) fonctionne
  // parfaitement d'ici là.
  // `tenants` est soumise au RLS : une lecture directe sans contexte ne
  // renverrait rien et le contrôle passerait inaperçu. On emprunte le même
  // chemin que l'application — le résolveur SECURITY DEFINER, puis un contexte
  // de tenant par cabinet.
  const slugs = await sql<{ slug: string }[]>`select slug from app.list_tenants()`
    .catch(() => []);

  if (slugs.length > 0) {
    const broken: string[] = [];
    for (const { slug } of slugs) {
      try {
        const [resolved] = await sql<{ id: string }[]>`
          select id from app.resolve_tenant_by_slug(${slug})
        `;
        if (!resolved) continue;
        const [row] = await withTenant({ tenantId: resolved.id }, (tx) =>
          tx<{ dek_wrapped: Uint8Array }[]>`select dek_wrapped from tenants`,
        );
        if (!row) continue;
        unwrapDek(Buffer.from(row.dek_wrapped));
      } catch {
        broken.push(slug);
      }
    }
    if (broken.length === 0) {
      ok(`clés déchiffrables pour les ${slugs.length} cabinet(s)`);
    } else {
      ko(
        `RYLA_KEK ne déchiffre pas la clé de : ${broken.join(", ")} — ` +
          `signature et lecture des réponses échoueront. ` +
          `Voir scripts/rewrap-dek.mjs.`,
      );
    }
  }

  // --- Hygiène de configuration -------------------------------------------
  if (url.password === "ryla_app") {
    warn("le mot de passe de ryla_app est encore celui de la migration — à changer");
  }
  if (env.kek.includes("ZGV2") || env.kek.startsWith("cnlsYS1kZXY")) {
    warn("RYLA_KEK est encore la clé de développement — à remplacer en production");
  }
  if (url.hostname.includes("supabase")) {
    warn(
      "Supabase n'est pas certifié HDS : ne pas y déposer de donnée de santé réelle",
    );
  }

  // Ryla parle PostgreSQL directement : ni SDK Supabase, ni PostgREST, ni
  // Supabase Auth. Ces clés d'API ne sont lues nulle part, et `sb_secret_…`
  // est la clé service_role — celle qui contourne tout.
  const unused = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_JWKS_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((name) => process.env[name]);

  if (unused.length > 0) {
    warn(
      `variables inutilisées par Ryla : ${unused.join(", ")} — seule ` +
        `DATABASE_URL compte. Ne déployez pas SUPABASE_SECRET_KEY (service_role).`,
    );
  }

  console.log("");
} catch (error) {
  console.error("\nÉchec :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db().end();
}
