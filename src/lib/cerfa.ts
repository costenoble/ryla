/**
 * Devis conventionnel dentaire — CERFA S3404.
 *
 * Rendu obligatoire par l'arrêté du 31 octobre 2020 pour tout acte
 * prothétique, orthodontique ou dépassant les tarifs opposables. Le devis doit
 * faire apparaître, ligne par ligne : le code CCAM, la description de l'acte
 * et du matériau, la base de remboursement, le montant des honoraires, et le
 * reste à charge estimé — ainsi que le panier de soins au titre de la réforme
 * 100 % santé.
 *
 * Tout est en centimes entiers. Les euros flottants et les montants légaux ne
 * font pas bon ménage.
 */

export const CARE_BASKETS = [
  "panier_100_sante",
  "panier_maitrise",
  "panier_libre",
] as const;

export type CareBasket = (typeof CARE_BASKETS)[number];

export const CARE_BASKET_LABELS: Record<CareBasket, string> = {
  panier_100_sante: "Panier 100 % santé (reste à charge nul)",
  panier_maitrise: "Panier aux tarifs maîtrisés",
  panier_libre: "Panier aux tarifs libres",
};

export type QuoteLineInput = {
  description: string;
  ccamCode?: string | null;
  toothNumbers?: string[] | null;
  careBasket?: CareBasket | null;
  material?: string | null;
  quantity: number;
  /** Honoraires demandés, par unité. */
  unitPriceCents: number;
  /** Base de remboursement de la sécurité sociale, par unité. */
  baseReimbursementCents: number;
  /** Taux de prise en charge AMO (0,70 pour la plupart des actes dentaires). */
  reimbursementRate: number;
  /** Part complémentaire, quand elle est connue au moment du devis. */
  amcCents?: number;
};

export type ComputedQuoteLine = QuoteLineInput & {
  grossCents: number;
  amoCents: number;
  amcCents: number;
  patientCents: number;
};

export function computeQuoteLine(line: QuoteLineInput): ComputedQuoteLine {
  const quantity = Math.max(1, Math.trunc(line.quantity));
  const grossCents = Math.round(line.unitPriceCents * quantity);
  const baseCents = Math.round(line.baseReimbursementCents * quantity);
  const amoCents = Math.min(grossCents, Math.round(baseCents * line.reimbursementRate));

  // Dans le panier 100 % santé, les honoraires sont plafonnés et la
  // complémentaire absorbe le solde : le reste à charge est nul par
  // construction. C'est la définition même du panier, pas une estimation.
  if (line.careBasket === "panier_100_sante") {
    return {
      ...line,
      quantity,
      grossCents,
      amoCents,
      amcCents: grossCents - amoCents,
      patientCents: 0,
    };
  }

  const amcCents = Math.max(0, Math.min(grossCents - amoCents, line.amcCents ?? 0));

  return {
    ...line,
    quantity,
    grossCents,
    amoCents,
    amcCents,
    patientCents: grossCents - amoCents - amcCents,
  };
}

export type QuoteTotals = {
  totalAmountCents: number;
  totalAmoCents: number;
  totalAmcCents: number;
  /** Reste à charge — le chiffre que le patient regarde en premier. */
  remainingChargeCents: number;
  lines: ComputedQuoteLine[];
};

export function computeQuoteTotals(lines: QuoteLineInput[]): QuoteTotals {
  const computed = lines.map(computeQuoteLine);

  return {
    lines: computed,
    totalAmountCents: computed.reduce((sum, line) => sum + line.grossCents, 0),
    totalAmoCents: computed.reduce((sum, line) => sum + line.amoCents, 0),
    totalAmcCents: computed.reduce((sum, line) => sum + line.amcCents, 0),
    remainingChargeCents: computed.reduce((sum, line) => sum + line.patientCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Conformité
// ---------------------------------------------------------------------------

export type CerfaHeader = {
  practitionerName?: string | null;
  practitionerIdentifier?: string | null; // RPPS / ADELI / n° AM
  practiceAddress?: string | null;
  patientLastName?: string | null;
  patientFirstName?: string | null;
  patientBirthDate?: string | null;
  issuedOn?: string | null;
  validityDays?: number | null;
};

/**
 * Contrôle des mentions obligatoires.
 *
 * Un devis incomplet, c'est un rejet de prise en charge par la complémentaire
 * ou un litige. Le champ verrouillé et bloquant vaut mieux que la relecture.
 */
export function checkCerfaCompleteness(
  header: CerfaHeader,
  lines: QuoteLineInput[],
): string[] {
  const errors: string[] = [];

  if (!header.practitionerName?.trim()) {
    errors.push("Nom du praticien manquant.");
  }
  if (!header.practitionerIdentifier?.trim()) {
    errors.push("Identifiant du praticien (RPPS / ADELI) manquant.");
  }
  if (!header.practiceAddress?.trim()) {
    errors.push("Adresse du cabinet manquante.");
  }
  if (!header.patientLastName?.trim() || !header.patientFirstName?.trim()) {
    errors.push("Identité du patient incomplète.");
  }
  if (!header.patientBirthDate?.trim()) {
    errors.push("Date de naissance du patient manquante.");
  }
  if (!header.issuedOn?.trim()) {
    errors.push("Date d'établissement du devis manquante.");
  }
  if (!header.validityDays || header.validityDays <= 0) {
    errors.push("Durée de validité du devis manquante.");
  }
  if (lines.length === 0) {
    errors.push("Le devis ne comporte aucun acte.");
  }

  lines.forEach((line, index) => {
    const position = `Ligne ${index + 1}`;
    if (!line.description?.trim()) {
      errors.push(`${position} : description de l'acte manquante.`);
    }
    if (!line.ccamCode?.trim()) {
      errors.push(`${position} : code CCAM manquant.`);
    }
    if (!line.careBasket) {
      errors.push(`${position} : panier de soins non renseigné.`);
    }
    if (line.baseReimbursementCents < 0 || line.unitPriceCents < 0) {
      errors.push(`${position} : montant négatif.`);
    }
    if (line.unitPriceCents < line.baseReimbursementCents) {
      errors.push(
        `${position} : honoraires inférieurs à la base de remboursement — vérifiez la saisie.`,
      );
    }
  });

  return errors;
}

/**
 * Obligation d'information sur l'alternative sans reste à charge : dès qu'un
 * acte relève d'un panier à tarif libre ou maîtrisé, le devis doit proposer
 * l'équivalent 100 % santé lorsqu'il existe.
 */
export function requiresZeroCostAlternative(lines: QuoteLineInput[]): boolean {
  const hasNonZeroCost = lines.some(
    (line) => line.careBasket === "panier_libre" || line.careBasket === "panier_maitrise",
  );
  const hasZeroCost = lines.some((line) => line.careBasket === "panier_100_sante");
  return hasNonZeroCost && !hasZeroCost;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
