import { describe, expect, it } from "vitest";
import {
  checkCerfaCompleteness,
  computeQuoteLine,
  computeQuoteTotals,
  requiresZeroCostAlternative,
  type QuoteLineInput,
} from "./cerfa";

const couronneMaitrisee: QuoteLineInput = {
  description: "Couronne céramo-métallique sur 26",
  ccamCode: "HBLD038",
  careBasket: "panier_maitrise",
  material: "Céramo-métallique",
  quantity: 1,
  unitPriceCents: 50_000,
  baseReimbursementCents: 12_050,
  reimbursementRate: 0.7,
  amcCents: 20_000,
};

const couronne100Sante: QuoteLineInput = {
  description: "Couronne zircone sur 36",
  ccamCode: "HBLD038",
  careBasket: "panier_100_sante",
  material: "Zircone",
  quantity: 1,
  unitPriceCents: 44_000,
  baseReimbursementCents: 12_050,
  reimbursementRate: 0.7,
};

describe("computeQuoteLine", () => {
  it("répartit honoraires, AMO, AMC et reste à charge", () => {
    const line = computeQuoteLine(couronneMaitrisee);
    expect(line.grossCents).toBe(50_000);
    expect(line.amoCents).toBe(8_435); // 120,50 € × 70 %
    expect(line.amcCents).toBe(20_000);
    expect(line.patientCents).toBe(21_565);
    expect(line.amoCents + line.amcCents + line.patientCents).toBe(line.grossCents);
  });

  it("garantit un reste à charge nul dans le panier 100 % santé", () => {
    // C'est la définition même du panier, pas une estimation : l'invariant doit
    // tenir quel que soit le tarif saisi.
    const line = computeQuoteLine(couronne100Sante);
    expect(line.patientCents).toBe(0);
    expect(line.amoCents + line.amcCents).toBe(line.grossCents);
  });

  it("ne laisse jamais l'AMC dépasser le solde après AMO", () => {
    const line = computeQuoteLine({ ...couronneMaitrisee, amcCents: 999_999 });
    expect(line.patientCents).toBe(0);
    expect(line.amcCents).toBe(line.grossCents - line.amoCents);
  });

  it("multiplie honoraires et base par la quantité", () => {
    const line = computeQuoteLine({ ...couronneMaitrisee, quantity: 3, amcCents: 0 });
    expect(line.grossCents).toBe(150_000);
    expect(line.amoCents).toBe(Math.round(12_050 * 3 * 0.7));
  });
});

describe("computeQuoteTotals", () => {
  it("additionne les lignes sans perdre de centime", () => {
    const totals = computeQuoteTotals([couronneMaitrisee, couronne100Sante]);
    expect(
      totals.totalAmoCents + totals.totalAmcCents + totals.remainingChargeCents,
    ).toBe(totals.totalAmountCents);
    expect(totals.remainingChargeCents).toBe(21_565);
  });
});

describe("conformité du devis", () => {
  it("signale les mentions obligatoires manquantes", () => {
    const errors = checkCerfaCompleteness({}, [
      { ...couronneMaitrisee, ccamCode: null, careBasket: null },
    ]);
    expect(errors).toContain("Nom du praticien manquant.");
    expect(errors).toContain("Identifiant du praticien (RPPS / ADELI) manquant.");
    expect(errors.some((e) => e.includes("code CCAM manquant"))).toBe(true);
    expect(errors.some((e) => e.includes("panier de soins non renseigné"))).toBe(true);
  });

  it("accepte un devis complet", () => {
    const errors = checkCerfaCompleteness(
      {
        practitionerName: "Dr Sophie Martin",
        practitionerIdentifier: "10003456789",
        practiceAddress: "12 rue des Capucins, 69001 Lyon",
        patientLastName: "Bertrand",
        patientFirstName: "Julien",
        patientBirthDate: "1979-03-14",
        issuedOn: "2026-07-28",
        validityDays: 30,
      },
      [couronneMaitrisee, couronne100Sante],
    );
    expect(errors).toEqual([]);
  });

  it("réclame une alternative 100 % santé quand le devis n'en propose aucune", () => {
    expect(requiresZeroCostAlternative([couronneMaitrisee])).toBe(true);
    expect(requiresZeroCostAlternative([couronneMaitrisee, couronne100Sante])).toBe(false);
  });
});
