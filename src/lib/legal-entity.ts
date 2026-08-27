/**
 * Identité juridique de l'éditeur.
 *
 * ⚠️ **À compléter avant la mise en production.** Les champs vides sont
 * signalés en clair sur les pages légales plutôt que masqués : une mention
 * légale incomplète est une infraction (article 6-III de la LCEN), et un
 * placeholder discret finirait par passer en production sans que personne ne
 * le voie. Mieux vaut un bandeau qui dérange.
 *
 * Aucune de ces valeurs n'est devinable : elles viennent du Kbis, du contrat
 * d'hébergement et de la police d'assurance. Elles sont donc laissées vides
 * plutôt qu'approximées.
 */

export type LegalEntity = {
  /** Dénomination sociale exacte, telle qu'au Kbis. */
  name: string;
  /** SAS, SARL, EURL, entreprise individuelle… */
  legalForm: string;
  /** Capital social en euros, formaté. Vide pour une entreprise individuelle. */
  capital: string;
  siren: string;
  rcs: string;
  vatNumber: string;
  address: string;
  email: string;
  phone: string;
  /** Directeur de la publication — une personne physique nommée. */
  publicationDirector: string;
  /** Délégué à la protection des données, s'il y en a un de désigné. */
  dpo: string;
};

export const RYLA: LegalEntity = {
  name: "",
  legalForm: "",
  capital: "",
  siren: "",
  rcs: "",
  vatNumber: "",
  address: "",
  email: "",
  phone: "",
  publicationDirector: "",
  dpo: "",
};

/**
 * Hébergeurs, à mentionner nommément.
 *
 * La LCEN impose de nommer l'hébergeur du site ; le code de la santé publique
 * impose en plus que l'hébergeur des données de santé soit certifié HDS
 * (article L1111-8). Les deux peuvent être distincts, d'où deux entrées.
 */
export type Host = { role: string; name: string; address: string; note?: string };

export const HOSTS: Host[] = [
  {
    role: "Hébergement de l'application",
    name: "",
    address: "",
  },
  {
    role: "Hébergement des données de santé",
    name: "",
    address: "",
    note: "Doit être certifié « Hébergeur de Données de Santé » (art. L1111-8 CSP).",
  },
];

/**
 * L'hébergeur des données de santé est-il nommé ?
 *
 * Sert de verrou aux arguments commerciaux. Tant que cette ligne est vide, la
 * vitrine ne revendique aucune certification HDS — annoncer un agrément qu'on
 * n'a pas est une allégation trompeuse au sens de l'article L121-2 du code de
 * la consommation, et se retourne d'autant plus vite qu'on s'adresse à des
 * professionnels de santé qui savent ce que le sigle recouvre.
 *
 * Le jour où la bascule est faite, on renseigne l'hébergeur ci-dessus et
 * l'argument réapparaît de lui-même. C'est la même donnée qui sert aux mentions
 * légales : une seule source, pas deux vérités.
 */
export function hasCertifiedHealthHost(): boolean {
  return (HOSTS[1]?.name ?? "").trim() !== "";
}

/** Champs obligatoires encore vides. Sert à afficher un avertissement visible. */
export function missingLegalFields(): string[] {
  const labels: Partial<Record<keyof LegalEntity, string>> = {
    name: "dénomination sociale",
    legalForm: "forme juridique",
    siren: "SIREN",
    rcs: "RCS",
    address: "adresse du siège",
    email: "email de contact",
    publicationDirector: "directeur de la publication",
  };

  const missing = Object.entries(labels)
    .filter(([key]) => RYLA[key as keyof LegalEntity].trim() === "")
    .map(([, label]) => label as string);

  for (const host of HOSTS) {
    if (host.name.trim() === "") missing.push(host.role.toLowerCase());
  }

  return missing;
}

/** Valeur affichable, ou un marqueur explicite quand elle manque. */
export function orMissing(value: string): string {
  return value.trim() === "" ? "à compléter" : value;
}
