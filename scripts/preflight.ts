/**
 * Contrôle avant `npm run dev`.
 *
 * Le cluster PostgreSQL du projet ne survit pas à un redémarrage de la machine,
 * et une base absente ne se manifeste que par un écran de connexion qui échoue
 * sans explication. Ce script démarre le cluster local si nécessaire, vérifie
 * que le schéma et le jeu de démonstration sont là, et rappelle les
 * identifiants — plutôt que de laisser chercher.
 *
 * Il n'échoue jamais : au pire il prévient et laisse Next démarrer, pour
 * pouvoir travailler l'interface sans base.
 */
import { execFileSync } from "node:child_process";
import { loadEnv } from "./load-env";

loadEnv();

import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
const ok = (text: string) => console.log(`  \x1b[32m✓\x1b[0m ${text}`);
const warn = (text: string) => console.log(`  \x1b[33m!\x1b[0m ${text}`);

/** Le cluster géré par ./scripts/pg.sh, celui qu'on sait redémarrer seul. */
function isProjectCluster(target: string): boolean {
  try {
    const { hostname, port } = new URL(target);
    return (hostname === "localhost" || hostname === "127.0.0.1") && port === "54329";
  } catch {
    return false;
  }
}

async function reachable(target: string): Promise<boolean> {
  const sql = postgres(target, { max: 1, connect_timeout: 4, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

console.log("");

if (!url) {
  warn("DATABASE_URL absent — copiez .env.example vers .env");
  process.exit(0);
}

// Piège rencontré : les migrations ont été jouées sur Supabase, mais
// DATABASE_URL pointe toujours sur le cluster local. L'application travaille
// alors sur une autre base que celle qu'on croit, sans aucun signe.
if (process.env.SUPABASE_URL && isProjectCluster(url)) {
  warn("SUPABASE_URL est configuré mais DATABASE_URL pointe sur la base LOCALE");
  warn("l'application n'utilisera pas Supabase tant que DATABASE_URL n'est pas changé");
  console.log("");
}

let up = await reachable(url);

if (!up && isProjectCluster(url)) {
  console.log("  · base injoignable, démarrage du cluster local…");
  try {
    execFileSync("./scripts/pg.sh", ["start"], { stdio: "pipe" });
    up = await reachable(url);
  } catch {
    /* message ci-dessous */
  }
}

if (!up) {
  warn(`base injoignable sur ${new URL(url).host}`);
  warn(
    isProjectCluster(url)
      ? "démarrez-la avec : npm run db:up"
      : "vérifiez DATABASE_URL dans .env",
  );
  console.log("");
  process.exit(0);
}

ok(`base joignable (${new URL(url).host})`);

const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });

try {
  const [schema] = await sql<{ tables: string }[]>`
    select count(*)::text as tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `;

  if (Number(schema?.tables ?? 0) < 2) {
    warn("schéma absent — lancez : npm run db:migrate && npm run db:seed");
    console.log("");
    process.exit(0);
  }
  ok(`schéma en place (${schema?.tables} tables)`);

  // Sans contexte de tenant le RLS masque tout : on passe par le résolveur
  // privilégié, exactement comme l'écran de connexion.
  const tenants = await sql<{ slug: string; name: string }[]>`
    select * from app.list_tenants()
  `.catch(() => []);

  if (tenants.length === 0) {
    warn("aucun cabinet — lancez : npm run db:seed");
  } else {
    console.log("");
    console.log("  Connexion : http://localhost:3000/connexion");
    console.log("  Mot de passe de démonstration : \x1b[1mryla-demo-2026\x1b[0m");
    console.log("");

    // Les emails praticien sont invisibles depuis le rôle applicatif sans
    // contexte de tenant — c'est le RLS qui fait son travail. Ce script étant
    // strictement local, il passe par le rôle propriétaire pour les afficher.
    const adminUrl = process.env.DATABASE_ADMIN_URL;
    const owners = new Map<string, string>();

    if (adminUrl) {
      const admin = postgres(adminUrl, { max: 1, connect_timeout: 4, onnotice: () => {} });
      try {
        const rows = await admin<{ slug: string; email: string }[]>`
          select t.slug, u.email
          from users u join tenants t on t.id = u.tenant_id
          where u.role = 'owner'
        `;
        for (const row of rows) owners.set(row.slug, row.email);
      } catch {
        /* on affichera le slug seul */
      } finally {
        await admin.end({ timeout: 2 });
      }
    }

    for (const tenant of tenants) {
      const email = owners.get(tenant.slug);
      console.log(
        `  • ${tenant.name} — ${email ?? `cabinet « ${tenant.slug} »`}`,
      );
    }
  }
  console.log("");
} catch (error) {
  warn(`contrôle interrompu : ${error instanceof Error ? error.message : error}`);
} finally {
  await sql.end({ timeout: 2 });
}
