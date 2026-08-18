import type { CareBasket } from "../cerfa";
import type { Tx } from "../db";

/**
 * Référentiel d'actes CCAM / NGAP.
 *
 * Table de référence partagée, hors cloisonnement par cabinet : la CCAM est un
 * texte réglementaire. C'est la seule lecture du projet qui ne dépende pas du
 * contexte de tenant, et sa politique RLS l'ouvre explicitement — le reste du
 * schéma ferme, celle-ci ouvre, et c'est écrit noir sur blanc dans 0007.
 */

export type NomenclatureEntry = {
  id: string;
  system: "CCAM" | "NGAP" | "HORS_NOMENCLATURE";
  code: string;
  label: string;
  shortLabel: string | null;
  specialty: "dentaire" | "esthetique" | "commun";
  category: string | null;
  baseReimbursementCents: number | null;
  reimbursementRate: number;
  ceilingCents: number | null;
  careBasket: CareBasket | null;
  reimbursable: boolean;
  ngapKey: string | null;
  ngapCoefficient: number | null;
  notes: string | null;
  /** true tant que la ligne n'a pas été confrontée à la base officielle. */
  needsReview: boolean;
};

type Row = {
  id: string;
  system: NomenclatureEntry["system"];
  code: string;
  label: string;
  short_label: string | null;
  specialty: NomenclatureEntry["specialty"];
  category: string | null;
  base_reimbursement_cents: number | null;
  reimbursement_rate: string;
  ceiling_cents: number | null;
  care_basket: CareBasket | null;
  reimbursable: boolean;
  ngap_key: string | null;
  ngap_coefficient: string | null;
  notes: string | null;
  needs_review: boolean;
};

function map(row: Row): NomenclatureEntry {
  return {
    id: row.id,
    system: row.system,
    code: row.code,
    label: row.label,
    shortLabel: row.short_label,
    specialty: row.specialty,
    category: row.category,
    baseReimbursementCents: row.base_reimbursement_cents,
    reimbursementRate: Number(row.reimbursement_rate),
    ceilingCents: row.ceiling_cents,
    careBasket: row.care_basket,
    reimbursable: row.reimbursable,
    ngapKey: row.ngap_key,
    ngapCoefficient: row.ngap_coefficient === null ? null : Number(row.ngap_coefficient),
    notes: row.notes,
    needsReview: row.needs_review,
  };
}

const COLUMNS = `
  id, system, code, label, short_label, specialty, category,
  base_reimbursement_cents, reimbursement_rate, ceiling_cents, care_basket,
  reimbursable, ngap_key, ngap_coefficient, notes, needs_review
`;

/**
 * Catalogue proposé à la saisie d'un devis.
 *
 * Filtré sur la spécialité du cabinet : un dentiste n'a rien à faire avec la
 * blépharoplastie dans sa liste déroulante, et l'inverse est vrai aussi. Un
 * cabinet « mixte » voit tout.
 *
 * Chargé d'un bloc plutôt que par requêtes de recherche successives : le
 * référentiel utile tient en quelques centaines de lignes, et le filtrage au
 * clavier doit être instantané — un aller-retour réseau par frappe rendrait la
 * saisie pénible pour aucune raison.
 */
export async function listNomenclature(
  tx: Tx,
  specialty: "dentaire" | "esthetique" | "mixte",
): Promise<NomenclatureEntry[]> {
  const scopes =
    specialty === "mixte"
      ? ["dentaire", "esthetique", "commun"]
      : [specialty, "commun"];

  const rows = await tx<Row[]>`
    select ${tx.unsafe(COLUMNS)}
    from nomenclature
    where specialty = any(${scopes})
    order by
      -- Les actes remboursables d'abord : c'est le gros de l'activité, et la
      -- liste doit s'ouvrir sur ce qu'on cherche neuf fois sur dix.
      reimbursable desc,
      category nulls last,
      label
  `;
  return rows.map(map);
}

export async function getNomenclatureEntry(
  tx: Tx,
  system: string,
  code: string,
): Promise<NomenclatureEntry | null> {
  const rows = await tx<Row[]>`
    select ${tx.unsafe(COLUMNS)}
    from nomenclature
    where system = ${system} and code = ${code}
  `;
  const row = rows[0];
  return row ? map(row) : null;
}

/** État du référentiel, pour prévenir le praticien quand les tarifs manquent. */
export async function nomenclatureStatus(
  tx: Tx,
): Promise<{ total: number; withoutTariff: number }> {
  const [row] = await tx<{ total: string; without_tariff: string }[]>`
    select count(*)::text as total,
           count(*) filter (where base_reimbursement_cents is null)::text as without_tariff
    from nomenclature
  `;
  return {
    total: Number(row?.total ?? 0),
    withoutTariff: Number(row?.without_tariff ?? 0),
  };
}

/**
 * Recherche au clavier, côté client.
 *
 * Exportée ici plutôt que dans le composant pour être testable sans rendu, et
 * parce que c'est elle qui décide de ce qu'un praticien pressé trouve ou non.
 */
export function matchNomenclature(
  entries: NomenclatureEntry[],
  query: string,
  limit = 40,
): NomenclatureEntry[] {
  const needle = normalize(query);
  if (needle === "") return entries.slice(0, limit);

  const words = needle.split(/\s+/).filter(Boolean);

  const scored = entries
    .map((entry) => {
      const code = normalize(entry.code);
      const label = normalize(`${entry.label} ${entry.shortLabel ?? ""}`);
      const haystack = `${code} ${label}`;
      const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);

      // Tous les mots doivent correspondre : « couronne zircone » ne doit pas
      // remonter toutes les couronnes.
      if (!words.every((word) => matchesWord(tokens, haystack, word))) return null;

      // Un code saisi en entier est une intention sans ambiguïté : il passe
      // devant, même si un libellé contient la même suite de lettres.
      let score = 0;
      if (code === needle) score += 100;
      else if (code.startsWith(needle)) score += 50;
      if (label.startsWith(needle)) score += 20;

      return { entry, score };
    })
    .filter((item): item is { entry: NomenclatureEntry; score: number } => item !== null);

  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return scored.slice(0, limit).map((item) => item.entry);
}

/**
 * Un mot de la recherche correspond-il à l'acte ?
 *
 * La correspondance exacte ne suffit pas. Un praticien tape « céramic »,
 * « ceramo », « couronn » — des troncatures et des fautes de frappe qui, avec
 * une simple inclusion de chaîne, ne remontent rien. Or une recherche qui ne
 * remonte rien ne renvoie pas le praticien vers le bon acte : elle l'envoie
 * saisir le code à la main, donc à côté.
 *
 * D'où la tolérance au préfixe commun : « céramic » et « céramique » partagent
 * six lettres, ce qui suffit. Le seuil reste proportionnel à ce qui a été tapé,
 * pour que « ceram » ne ramène pas la moitié du catalogue.
 */
function matchesWord(tokens: string[], haystack: string, word: string): boolean {
  if (haystack.includes(word)) return true;
  if (word.length < 4) return false;

  const needed = Math.max(4, Math.ceil(word.length * 0.75));
  return tokens.some((token) => commonPrefix(token, word) >= needed);
}

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index += 1;
  return index;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
