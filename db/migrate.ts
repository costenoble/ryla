/**
 * Exécuteur de migrations.
 *
 * Volontairement minimal : des fichiers .sql numérotés, joués une fois, dans
 * l'ordre, chacun dans sa transaction. Les politiques RLS et les fonctions
 * SECURITY DEFINER se lisent bien mieux en SQL brut qu'à travers un ORM — et
 * c'est le code qu'on relira en audit.
 *
 *   npm run db:migrate          applique les migrations en attente
 *   npm run db:reset            détruit le schéma et rejoue tout
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv } from "../scripts/load-env";

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL (ou DATABASE_URL) est requis.");
  process.exit(1);
}

/**
 * `--reset` détruit le schéma public. C'est anodin sur un cluster local et
 * irréversible ailleurs — sur une base managée, ça emporterait aussi ce que
 * l'hébergeur y a installé. On refuse donc toute base distante sans une
 * confirmation explicite.
 */
function isLocalDatabase(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

const sql = postgres(adminUrl, {
  max: 1,
  onnotice: (notice) => console.log(`  ${notice.message}`),
  // Un pooler en mode transaction ne rejoue pas les instructions préparées.
  prepare: !(adminUrl.includes(":6543") || adminUrl.includes("pooler.")),
});

const reset = process.argv.includes("--reset");

try {
  if (reset && !isLocalDatabase(adminUrl) && !process.argv.includes("--i-know")) {
    console.error(
      "Refus : --reset détruit le schéma public et la base visée n'est pas locale.\n" +
        `Cible : ${new URL(adminUrl).host}\n` +
        "Ajoutez --i-know si c'est bien l'intention.",
    );
    process.exit(1);
  }

  if (reset) {
    console.log("• Réinitialisation du schéma…");
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists app cascade;
      create schema public;
    `);
  }

  await sql.unsafe(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now(),
      checksum text
    );
  `);

  const applied = new Set(
    (await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name),
  );

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // `--baseline` : marque les migrations comme appliquées sans les rejouer.
  // Cas réel : le schéma a été créé à la main dans un éditeur SQL (Supabase),
  // sans passer par ce script. Sans ce garde-fou, la prochaine exécution
  // tenterait de tout recréer et échouerait sur des tables existantes.
  if (process.argv.includes("--baseline")) {
    let marked = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      await sql`insert into _migrations (name) values (${file})`;
      console.log(`• ${file} … marquée comme appliquée`);
      marked += 1;
    }
    console.log(
      marked === 0 ? "Rien à marquer." : `${marked} migration(s) marquée(s).`,
    );
    process.exit(0);
  }

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(join(migrationsDir, file), "utf8");
    process.stdout.write(`• ${file} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into _migrations (name) values (${file})`;
    });
    console.log("ok");
    count += 1;
  }

  console.log(
    count === 0 ? "Aucune migration en attente." : `${count} migration(s) appliquée(s).`,
  );
} catch (error) {
  console.error("\nÉchec de la migration :");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
