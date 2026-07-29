/**
 * Création d'un cabinet et de son praticien.
 *
 * C'est la commande d'onboarding : elle provisionne le tenant, sa clé de
 * chiffrement, son compte propriétaire, et installe la bibliothèque de modèles
 * correspondant à sa spécialité. Elle vise la base pointée par `DATABASE_URL`,
 * quelle qu'elle soit — cluster local, Supabase, OVH.
 *
 *   npx tsx scripts/create-cabinet.ts \
 *     --slug=cabinet-martin \
 *     --name="Cabinet dentaire Martin" \
 *     --email=sophie@exemple.fr \
 *     --password='…' \
 *     [--full-name="Dr Sophie Martin"] \
 *     [--specialty=dentaire|esthetique|mixte] \
 *     [--rpps=10003456789] \
 *     [--no-library]
 */
import { loadEnv } from "./load-env";

loadEnv();

import { generateDek, hashPassword, wrapDek } from "../src/lib/crypto";
import { db, withPrivileged, withTenant } from "../src/lib/db";
import { parseFormDefinition } from "../src/lib/form-schema";
import { librarySelection } from "../src/lib/library";
import { createTemplate, getTemplateByKey } from "../src/lib/repos/forms";
import { recordAudit } from "../src/lib/audit";
import { env } from "../src/lib/env";

type Specialty = "dentaire" | "esthetique" | "mixte";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const slug = (arg("slug") ?? "").trim().toLowerCase();
const name = (arg("name") ?? "").trim();
const email = (arg("email") ?? "").trim();
const password = arg("password") ?? "";
const fullName = (arg("full-name") ?? "").trim() || name;
const specialty = (arg("specialty") ?? "mixte") as Specialty;
const rpps = (arg("rpps") ?? "").trim() || null;
const withLibrary = !process.argv.includes("--no-library");

const problems: string[] = [];
if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) {
  problems.push("--slug : minuscules, chiffres et tirets (ex. cabinet-martin)");
}
if (!name) problems.push("--name : nom affiché du cabinet");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push("--email : adresse invalide");
// Un mot de passe court sur un compte qui ouvre des dossiers médicaux n'a pas
// de sens : le refus est volontairement sec.
if (password.length < 10) problems.push("--password : 10 caractères minimum");
if (!["dentaire", "esthetique", "mixte"].includes(specialty)) {
  problems.push("--specialty : dentaire, esthetique ou mixte");
}

if (problems.length > 0) {
  console.error("\nParamètres manquants ou invalides :");
  for (const p of problems) console.error(`  • ${p}`);
  console.error("\nExemple :");
  console.error(
    "  npx tsx scripts/create-cabinet.ts --slug=cabinet-martin \\\n" +
      '    --name="Cabinet dentaire Martin" --email=sophie@exemple.fr \\\n' +
      "    --password='mot-de-passe-solide' --specialty=dentaire\n",
  );
  process.exit(1);
}

try {
  const host = new URL(env.databaseUrl).host;
  console.log(`\nBase : ${host}`);

  const existing = await withPrivileged(
    (sql) => sql<{ id: string }[]>`select id from app.resolve_tenant_by_slug(${slug})`,
  );

  let tenantId: string;
  let created = false;

  if (existing[0]) {
    tenantId = existing[0].id;
    console.log(`  · cabinet « ${slug} » déjà présent, ajout du praticien`);
  } else {
    const rows = await withPrivileged(
      (sql) => sql<{ provision_tenant: string }[]>`
        select app.provision_tenant(${slug}, ${name}, ${specialty}, ${wrapDek(generateDek())})
      `,
    );
    tenantId = rows[0]!.provision_tenant;
    created = true;
    console.log(`  ✓ cabinet créé (${slug})`);
  }

  await withTenant({ tenantId }, async (tx) => {
    const [duplicate] = await tx<{ id: string }[]>`
      select id from users where lower(email) = lower(${email})
    `;
    if (duplicate) {
      throw new Error(`Un compte existe déjà avec l'adresse ${email}.`);
    }

    const [user] = await tx<{ id: string }[]>`
      insert into users (tenant_id, email, password_hash, full_name, role, rpps)
      values (${tenantId}, ${email}, ${hashPassword(password)}, ${fullName}, 'owner', ${rpps})
      returning id
    `;
    console.log(`  ✓ praticien créé (${email})`);

    if (withLibrary) {
      let installed = 0;
      for (const entry of librarySelection(specialty)) {
        if (await getTemplateByKey(tx, entry.key)) continue;
        const definition = parseFormDefinition(entry.definition);
        await createTemplate(tx, {
          tenantId,
          key: entry.key,
          title: definition.title,
          description: definition.intro ?? null,
          kind: entry.kind,
          specialty: entry.specialty,
          libraryRef: entry.libraryRef,
          definition,
          createdBy: user?.id ?? null,
        });
        installed += 1;
      }
      console.log(
        installed > 0
          ? `  ✓ ${installed} modèle(s) installé(s) depuis la bibliothèque`
          : "  · modèles déjà présents",
      );
    }

    await recordAudit(tx, tenantId, {
      actorType: "system",
      action: created ? "tenant.created" : "user.created",
      objectType: "user",
      objectId: user?.id ?? null,
      metadata: { slug, email, specialty },
    });
  });

  const base = new URL(env.appBaseUrl);
  console.log("\n  Connexion :");
  console.log(`    URL      ${base.origin}/connexion`);
  console.log(`    Cabinet  ${slug}`);
  console.log(`    Email    ${email}`);
  console.log("");
} catch (error) {
  console.error(`\nÉchec : ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
} finally {
  await db().end();
}
