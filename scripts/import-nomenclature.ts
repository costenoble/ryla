/**
 * Import du référentiel d'actes.
 *
 *   npm run nomenclature:starter              jeu de départ (codes et libellés)
 *   npm run nomenclature:import -- --file=ccam.csv --system=CCAM
 *
 * Passe par `DATABASE_ADMIN_URL` : la table `nomenclature` est en lecture seule
 * pour le rôle applicatif, parce qu'un cabinet ne réécrit pas la CCAM.
 *
 * Format CSV attendu (en-tête obligatoire, séparateur `;` ou `,`) :
 *
 *   code;label;short_label;specialty;category;base_reimbursement_cents;
 *   reimbursement_rate;ceiling_cents;care_basket;reimbursable;
 *   ngap_key;ngap_coefficient;notes;effective_from
 *
 * Seuls `code` et `label` sont obligatoires. Les colonnes absentes sont
 * ignorées, ce qui permet de charger un export officiel partiel sans le
 * remanier — on complétera plus tard sans avoir à tout rejouer.
 *
 * Les montants s'expriment en centimes entiers. Une colonne nommée
 * `base_reimbursement_euros` (ou `..._euros` en général) est acceptée et
 * convertie : les exports officiels sont en euros, et convertir à la main est
 * précisément le genre d'étape où un facteur 100 se glisse.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadEnv } from "./load-env";

loadEnv();

import {
  NOMENCLATURE_SEED,
  NOMENCLATURE_SEED_SOURCE,
  type NomenclatureSeed,
} from "../src/lib/nomenclature/starter";

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL (ou DATABASE_URL) est requis.");
  process.exit(1);
}

function arg(name: string): string | null {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

const sql = postgres(adminUrl, {
  max: 1,
  onnotice: () => {},
  prepare: !(adminUrl.includes(":6543") || adminUrl.includes("pooler.")),
});

type Row = {
  system: string;
  code: string;
  label: string;
  shortLabel: string | null;
  specialty: string;
  category: string | null;
  baseReimbursementCents: number | null;
  reimbursementRate: number;
  ceilingCents: number | null;
  careBasket: string | null;
  reimbursable: boolean;
  ngapKey: string | null;
  ngapCoefficient: number | null;
  notes: string | null;
  source: string;
  effectiveFrom: string | null;
  needsReview: boolean;
};

function fromSeed(entry: NomenclatureSeed): Row {
  return {
    system: entry.system,
    code: entry.code,
    label: entry.label,
    shortLabel: entry.shortLabel ?? null,
    specialty: entry.specialty,
    category: entry.category,
    // Le jeu de départ ne porte volontairement aucun tarif : un chiffre
    // approximatif sur un devis opposable coûte plus cher qu'un champ vide.
    baseReimbursementCents: null,
    reimbursementRate: entry.reimbursementRate ?? 0.7,
    ceilingCents: null,
    careBasket: null,
    reimbursable: entry.reimbursable,
    ngapKey: entry.ngapKey ?? null,
    ngapCoefficient: null,
    notes: entry.notes ?? null,
    source: NOMENCLATURE_SEED_SOURCE,
    effectiveFrom: null,
    needsReview: true,
  };
}

// ---------------------------------------------------------------------------
// Lecture CSV
// ---------------------------------------------------------------------------

/** Découpage respectant les guillemets — un libellé CCAM contient des virgules. */
function splitLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

function toCents(value: string | undefined, isEuros: boolean): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return isEuros ? Math.round(parsed * 100) : Math.round(parsed);
}

function parseCsv(content: string, defaultSystem: string): Row[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines.shift();
  if (!header) throw new Error("Fichier vide.");

  const separator = header.includes(";") ? ";" : ",";
  const columns = splitLine(header, separator).map((name) =>
    name.toLowerCase().replace(/\s+/g, "_"),
  );

  const indexOf = (...names: string[]): number =>
    names.map((name) => columns.indexOf(name)).find((index) => index >= 0) ?? -1;

  const at = (cells: string[], index: number): string | undefined =>
    index >= 0 ? cells[index] : undefined;

  const codeIdx = indexOf("code", "code_acte", "code_ccam");
  const labelIdx = indexOf("label", "libelle", "libellé", "designation");
  if (codeIdx < 0 || labelIdx < 0) {
    throw new Error("Colonnes « code » et « label » (ou « libelle ») requises.");
  }

  const brIdx = indexOf("base_reimbursement_cents", "base_remboursement_cents");
  const brEurosIdx = indexOf(
    "base_reimbursement_euros",
    "base_remboursement_euros",
    "base_remboursement",
    "br",
  );
  const ceilIdx = indexOf("ceiling_cents", "plafond_cents");
  const ceilEurosIdx = indexOf("ceiling_euros", "plafond_euros", "hlf", "honoraire_limite");

  return lines.map((line) => {
    const cells = splitLine(line, separator);
    const reimbursableRaw = at(cells, indexOf("reimbursable", "remboursable"));

    return {
      system: at(cells, indexOf("system", "systeme")) || defaultSystem,
      code: at(cells, codeIdx) ?? "",
      label: at(cells, labelIdx) ?? "",
      shortLabel: at(cells, indexOf("short_label", "libelle_court")) || null,
      specialty: at(cells, indexOf("specialty", "specialite")) || "commun",
      category: at(cells, indexOf("category", "categorie")) || null,
      baseReimbursementCents:
        toCents(at(cells, brIdx), false) ?? toCents(at(cells, brEurosIdx), true),
      reimbursementRate: Number(
        (at(cells, indexOf("reimbursement_rate", "taux")) || "0.7").replace(",", "."),
      ),
      ceilingCents: toCents(at(cells, ceilIdx), false) ?? toCents(at(cells, ceilEurosIdx), true),
      careBasket: at(cells, indexOf("care_basket", "panier")) || null,
      reimbursable: reimbursableRaw ? !/^(0|false|non|n)$/i.test(reimbursableRaw) : true,
      ngapKey: at(cells, indexOf("ngap_key", "lettre_cle")) || null,
      ngapCoefficient: Number(at(cells, indexOf("ngap_coefficient", "coefficient")) ?? "") || null,
      notes: at(cells, indexOf("notes", "commentaire")) || null,
      source: arg("source") ?? `Import ${new Date().toISOString().slice(0, 10)}`,
      effectiveFrom: at(cells, indexOf("effective_from", "date_effet")) || null,
      // Une ligne issue d'un fichier officiel est réputée fiable : c'est tout
      // l'objet de l'import.
      needsReview: false,
    };
  });
}

// ---------------------------------------------------------------------------

async function upsert(rows: Row[]): Promise<number> {
  let written = 0;
  for (const row of rows) {
    if (!row.code || !row.label) continue;
    await sql`
      insert into nomenclature (
        system, code, label, short_label, specialty, category,
        base_reimbursement_cents, reimbursement_rate, ceiling_cents, care_basket,
        reimbursable, ngap_key, ngap_coefficient, notes, source, effective_from,
        needs_review
      ) values (
        ${row.system}, ${row.code}, ${row.label}, ${row.shortLabel},
        ${row.specialty}, ${row.category}, ${row.baseReimbursementCents},
        ${row.reimbursementRate}, ${row.ceilingCents}, ${row.careBasket},
        ${row.reimbursable}, ${row.ngapKey}, ${row.ngapCoefficient},
        ${row.notes}, ${row.source}, ${row.effectiveFrom}, ${row.needsReview}
      )
      on conflict (system, code) do update set
        label = excluded.label,
        short_label = coalesce(excluded.short_label, nomenclature.short_label),
        specialty = excluded.specialty,
        category = coalesce(excluded.category, nomenclature.category),
        -- Un import partiel ne doit pas effacer un tarif déjà chargé : on ne
        -- remplace que si la nouvelle valeur existe.
        base_reimbursement_cents = coalesce(
          excluded.base_reimbursement_cents, nomenclature.base_reimbursement_cents),
        ceiling_cents = coalesce(excluded.ceiling_cents, nomenclature.ceiling_cents),
        care_basket = coalesce(excluded.care_basket, nomenclature.care_basket),
        reimbursement_rate = excluded.reimbursement_rate,
        reimbursable = excluded.reimbursable,
        ngap_key = coalesce(excluded.ngap_key, nomenclature.ngap_key),
        ngap_coefficient = coalesce(excluded.ngap_coefficient, nomenclature.ngap_coefficient),
        notes = coalesce(excluded.notes, nomenclature.notes),
        source = excluded.source,
        effective_from = coalesce(excluded.effective_from, nomenclature.effective_from),
        -- Une ligne relue une fois le reste : l'import officiel lève le doute,
        -- le jeu de départ ne le repose pas.
        needs_review = nomenclature.needs_review and excluded.needs_review,
        updated_at = now()
    `;
    written += 1;
  }
  return written;
}

try {
  const file = arg("file");
  const rows = file
    ? parseCsv(await readFile(file, "utf8"), arg("system") ?? "CCAM")
    : NOMENCLATURE_SEED.map(fromSeed);

  const written = await upsert(rows);

  const [stats] = await sql<{ total: string; sans_tarif: string }[]>`
    select count(*)::text as total,
           count(*) filter (where base_reimbursement_cents is null)::text as sans_tarif
    from nomenclature
  `;

  console.log(
    file
      ? `• ${written} acte(s) importé(s) depuis ${file}.`
      : `• ${written} acte(s) du jeu de départ (codes et libellés, sans tarif).`,
  );
  console.log(`• Référentiel : ${stats?.total ?? 0} actes, dont ${stats?.sans_tarif ?? 0} sans tarif.`);

  if (Number(stats?.sans_tarif ?? 0) > 0) {
    console.log(
      "\n  Les actes sans tarif s'utilisent déjà : le praticien saisit la base de\n" +
        "  remboursement et ses honoraires. Pour les préremplir, importez la base\n" +
        "  officielle :\n" +
        "      npm run nomenclature:import -- --file=<export>.csv --system=CCAM",
    );
  }
} catch (error) {
  console.error("\nÉchec de l'import :");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
