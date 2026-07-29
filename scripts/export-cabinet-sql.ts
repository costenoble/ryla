/**
 * Génère le SQL de création d'un cabinet, à coller dans un éditeur SQL.
 *
 * Utile quand la base n'est pas joignable en PostgreSQL depuis le poste — un
 * réseau qui filtre les ports 5432/6543, une connexion directe Supabase en
 * IPv6 sans route. Tout ce qui doit être calculé côté application (clé de
 * chiffrement du cabinet, empreinte du mot de passe, empreintes des modèles)
 * l'est ici ; le SQL produit n'a plus qu'à être exécuté.
 *
 *   npx tsx scripts/export-cabinet-sql.ts \
 *     --slug=cabinet-martin --name="Cabinet dentaire Martin" \
 *     --email=sophie@exemple.fr --password='…' --specialty=dentaire \
 *     > cabinet.sql
 */
import { loadEnv } from "./load-env";

loadEnv();

import { canonicalHash, generateDek, hashPassword, wrapDek } from "../src/lib/crypto";
import { parseFormDefinition, validateDefinitionIntegrity } from "../src/lib/form-schema";
import { librarySelection } from "../src/lib/library";

type Specialty = "dentaire" | "esthetique" | "mixte";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const slug = (arg("slug") ?? "").trim().toLowerCase();
const name = (arg("name") ?? "").trim();
const email = (arg("email") ?? "").trim();
const password = arg("password") ?? "";
const fullName = (arg("full-name") ?? "").trim() || name;
const specialty = (arg("specialty") ?? "mixte") as Specialty;
const rpps = (arg("rpps") ?? "").trim();
const appPassword = arg("app-password") ?? "";

const problems: string[] = [];
if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) problems.push("--slug invalide");
if (!name) problems.push("--name requis");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push("--email invalide");
if (password.length < 10) problems.push("--password : 10 caractères minimum");
if (!["dentaire", "esthetique", "mixte"].includes(specialty)) problems.push("--specialty invalide");

if (problems.length > 0) {
  console.error("Paramètres invalides :\n  " + problems.join("\n  "));
  process.exit(1);
}

/** Littéral SQL : on double les apostrophes, rien d'autre à échapper. */
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** bytea au format hexadécimal — plus sûr qu'un échappement d'octets. */
const bytea = (buffer: Buffer) => `'\\x${buffer.toString("hex")}'::bytea`;

/**
 * Les définitions de formulaire contiennent des apostrophes en pagaille :
 * le dollar-quoting évite de les échapper une par une.
 */
const json = (value: unknown) => `$ryla$${JSON.stringify(value)}$ryla$::jsonb`;

const out: string[] = [];
const push = (line = "") => out.push(line);

push("-- ===========================================================================");
push(`-- Ryla — création du cabinet « ${name} »`);
push(`-- Généré le ${new Date().toISOString()}`);
push("--");
push("-- À exécuter dans l'éditeur SQL de la base cible. Idempotent : relancer ce");
push("-- script ne crée pas de doublon.");
push("-- ===========================================================================");
push();
push("begin;");
push();

// --- Mot de passe du rôle applicatif ---------------------------------------
if (appPassword) {
  push("-- Rôle applicatif : le mot de passe de la migration est un défaut de");
  push("-- développement, il doit être remplacé avant toute mise en service.");
  push(`alter role ryla_app with password ${q(appPassword)};`);
  push();
}

// --- Cabinet ---------------------------------------------------------------
push("-- Cabinet et sa clé de chiffrement (enveloppe : chiffrée par la KEK maître).");
push("-- Sans cette clé, aucune réponse de santé ne peut être ni écrite ni lue.");
push(`insert into tenants (slug, name, specialty, dek_wrapped)`);
push(`values (${q(slug)}, ${q(name)}, ${q(specialty)}, ${bytea(wrapDek(generateDek()))})`);
push("on conflict (slug) do nothing;");
push();

// --- Praticien -------------------------------------------------------------
push("-- Praticien propriétaire. L'empreinte scrypt est calculée hors base :");
push("-- le mot de passe en clair n'apparaît nulle part dans ce fichier.");
push("insert into users (tenant_id, email, password_hash, full_name, role, rpps)");
push("select t.id, " + [q(email), q(hashPassword(password)), q(fullName), "'owner'", rpps ? q(rpps) : "null"].join(", "));
push(`from tenants t where t.slug = ${q(slug)}`);
push("on conflict do nothing;");
push();

// --- Bibliothèque de modèles ----------------------------------------------
push("-- Bibliothèque de modèles de la spécialité.");
for (const entry of librarySelection(specialty)) {
  const definition = parseFormDefinition(entry.definition);
  const errors = validateDefinitionIntegrity(definition);
  if (errors.length > 0) {
    console.error(`Modèle « ${entry.key} » invalide : ${errors.join(", ")}`);
    process.exit(1);
  }
  const contentHash = canonicalHash(definition);

  push();
  push(`-- ${definition.title}`);
  push("-- Trois instructions distinctes, et pas une CTE unique : en PostgreSQL,");
  push("-- un UPDATE ne voit pas les lignes insérées par une CTE de la même");
  push("-- instruction — current_version_id resterait NULL et le modèle");
  push("-- n'apparaîtrait nulle part.");
  push("insert into form_templates (tenant_id, key, title, description, kind, specialty, library_ref)");
  push(
    "select t.id, " +
      [
        q(entry.key),
        q(definition.title),
        definition.intro ? q(definition.intro) : "null",
        q(entry.kind),
        q(entry.specialty),
        q(entry.libraryRef),
      ].join(", "),
  );
  push(`from tenants t where t.slug = ${q(slug)}`);
  push("on conflict (tenant_id, key) do nothing;");
  push();
  push("insert into form_versions (tenant_id, template_id, version, definition, content_hash, published_at)");
  push(`select ft.tenant_id, ft.id, 1, ${json(definition)}, ${q(contentHash)}, now()`);
  push("from form_templates ft join tenants t on t.id = ft.tenant_id");
  push(`where t.slug = ${q(slug)} and ft.key = ${q(entry.key)}`);
  push("  and not exists (select 1 from form_versions v where v.template_id = ft.id);");
  push();
  push("update form_templates ft set current_version_id = v.id");
  push("from form_versions v, tenants t");
  push("where v.template_id = ft.id and ft.tenant_id = t.id");
  push(`  and t.slug = ${q(slug)} and ft.key = ${q(entry.key)} and v.version = 1;`);
}

push();
push("commit;");
push();
push("-- Vérification :");
push(`--   select t.slug, u.email, count(f.id) as modeles`);
push(`--   from tenants t`);
push(`--     left join users u on u.tenant_id = t.id and u.role = 'owner'`);
push(`--     left join form_templates f on f.tenant_id = t.id`);
push(`--   where t.slug = ${q(slug)}`);
push(`--   group by t.slug, u.email;`);

console.log(out.join("\n"));
