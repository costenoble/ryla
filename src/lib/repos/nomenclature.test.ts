import { describe, expect, it } from "vitest";
import { matchNomenclature, type NomenclatureEntry } from "./nomenclature";

/**
 * La recherche décide de ce qu'un praticien pressé trouve — ou ne trouve pas.
 * Un acte introuvable finit saisi à la main, donc avec un code approximatif sur
 * un document opposable : c'est exactement ce que le référentiel doit éviter.
 */

function entry(partial: Partial<NomenclatureEntry> & { code: string; label: string }): NomenclatureEntry {
  return {
    id: partial.code,
    system: "CCAM",
    shortLabel: null,
    specialty: "dentaire",
    category: null,
    baseReimbursementCents: null,
    reimbursementRate: 0.7,
    ceilingCents: null,
    careBasket: null,
    reimbursable: true,
    ngapKey: null,
    ngapCoefficient: null,
    notes: null,
    needsReview: true,
    ...partial,
  };
}

const catalogue: NomenclatureEntry[] = [
  entry({
    code: "HBLD038",
    label: "Pose d'une couronne dentaire dentoportée céramométallique",
    shortLabel: "Couronne céramométallique",
  }),
  entry({
    code: "HBLD033",
    label: "Pose d'une couronne dentaire dentoportée céramique monolithique",
    shortLabel: "Couronne zircone / céramique",
  }),
  entry({ code: "HBJD001", label: "Détartrage des deux arcades dentaires" }),
  entry({ code: "SPR", system: "NGAP", label: "Soins prothétiques", ngapKey: "SPR" }),
];

describe("recherche dans le référentiel", () => {
  it("trouve par code exact, quelle que soit la casse", () => {
    expect(matchNomenclature(catalogue, "hbld038")[0]?.code).toBe("HBLD038");
  });

  it("place le code exact devant les autres résultats", () => {
    // « HBLD033 » et « HBLD038 » partagent un préfixe : saisir le code entier
    // est une intention sans ambiguïté, elle doit primer.
    expect(matchNomenclature(catalogue, "HBLD033")[0]?.code).toBe("HBLD033");
  });

  it("ignore les accents", () => {
    const found = matchNomenclature(catalogue, "ceramometallique");
    expect(found.map((item) => item.code)).toContain("HBLD038");
  });

  it("exige que tous les mots soient présents", () => {
    // « couronne zircone » ne doit pas remonter toutes les couronnes.
    const found = matchNomenclature(catalogue, "couronne zircone");
    expect(found.map((item) => item.code)).toEqual(["HBLD033"]);
  });

  it("cherche aussi dans le libellé court", () => {
    expect(matchNomenclature(catalogue, "céramométallique")[0]?.code).toBe("HBLD038");
  });

  it("trouve une lettre-clé NGAP", () => {
    expect(matchNomenclature(catalogue, "SPR")[0]?.code).toBe("SPR");
  });

  it("ne renvoie rien pour un acte absent, plutôt qu'un résultat approchant", () => {
    // Mieux vaut zéro résultat qu'un acte voisin cliqué par réflexe.
    expect(matchNomenclature(catalogue, "blepharoplastie")).toHaveLength(0);
  });

  it("renvoie le catalogue entier sur une recherche vide", () => {
    expect(matchNomenclature(catalogue, "  ")).toHaveLength(catalogue.length);
  });

  it("respecte la limite demandée", () => {
    expect(matchNomenclature(catalogue, "", 2)).toHaveLength(2);
  });
});
