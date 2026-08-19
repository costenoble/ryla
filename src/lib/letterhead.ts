/**
 * En-tête de documents du cabinet.
 *
 * Module volontairement sans dépendance : il est importé par l'éditeur des
 * réglages, qui est un composant client. Le laisser dans `tenant.ts` tirait
 * `db.ts`, donc le pilote PostgreSQL, dans le paquet du navigateur — et le
 * build échouait sur `Can't resolve 'tls'`, un message qui ne désigne pas
 * l'import fautif.
 */

export type LetterheadBlock = {
  text: string;
  bold?: boolean;
  size?: "title" | "normal" | "small";
  align?: "left" | "center" | "right";
};

/** Ce dont la fonction ci-dessous a besoin, sans dépendre de tout `TenantBranding`. */
type LetterheadSource = {
  letterheadBlocks?: LetterheadBlock[];
  letterheadText?: string;
};

/**
 * Ramène un en-tête à sa forme structurée.
 *
 * Les cabinets qui avaient déjà saisi un bloc de texte libre ne doivent rien
 * perdre : chaque ligne devient un bloc, la première en titre gras — c'est la
 * convention qu'ils appliquaient déjà à la main.
 */
export function letterheadBlocks(source: LetterheadSource): LetterheadBlock[] {
  if (source.letterheadBlocks?.length) return source.letterheadBlocks;

  return (source.letterheadText ?? "")
    .split("\n")
    .map((line, index) => ({
      text: line,
      bold: index === 0,
      size: (index === 0 ? "title" : "normal") as LetterheadBlock["size"],
      align: "left" as const,
    }))
    .filter((block) => block.text.trim() !== "");
}
