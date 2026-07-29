import { describe, expect, it } from "vitest";
import { computeVisibility, evaluateCondition, validateAnswers } from "./branching";
import {
  parseFormDefinition,
  type FormDefinitionInput,
  validateDefinitionIntegrity,
} from "./form-schema";
import { anamneseDentaire } from "./library/dentaire";
import { computeVigilance } from "./vigilance";

const definition = parseFormDefinition(anamneseDentaire);

describe("evaluateCondition", () => {
  it("compare les nombres numériquement et les dates lexicalement", () => {
    expect(evaluateCondition({ field: "n", op: "gt", value: 9 }, { n: 10 })).toBe(true);
    // Le piège classique : "10" < "9" en comparaison de chaînes.
    expect(evaluateCondition({ field: "n", op: "gt", value: "9" }, { n: "10" })).toBe(true);
    expect(
      evaluateCondition({ field: "d", op: "gte", value: "2026-01-31" }, { d: "2026-02-01" }),
    ).toBe(true);
  });

  it("traite `in` comme une intersection sur les réponses multiples", () => {
    const answers = { pathologies: ["diabete", "asthme"] };
    expect(
      evaluateCondition({ field: "pathologies", op: "in", value: ["diabete"] }, answers),
    ).toBe(true);
    expect(
      evaluateCondition({ field: "pathologies", op: "in", value: ["cancer"] }, answers),
    ).toBe(false);
  });

  it("distingue absence de réponse et réponse fausse", () => {
    expect(evaluateCondition({ field: "x", op: "empty" }, {})).toBe(true);
    expect(evaluateCondition({ field: "x", op: "empty" }, { x: false })).toBe(false);
    expect(evaluateCondition({ field: "x", op: "answered" }, { x: "" })).toBe(false);
    expect(evaluateCondition({ field: "x", op: "answered" }, { x: [] })).toBe(false);
  });

  it("combine all / any / not", () => {
    const answers = { a: true, b: "non" };
    expect(
      evaluateCondition(
        {
          all: [
            { field: "a", op: "eq", value: true },
            { not: { field: "b", op: "eq", value: "oui" } },
          ],
        },
        answers,
      ),
    ).toBe(true);
  });

  it("est faux quand la condition vise un champ inexistant", () => {
    expect(evaluateCondition({ field: "inconnu", op: "eq", value: true }, {})).toBe(false);
  });
});

describe("computeVisibility", () => {
  it("masque les questions de suivi tant que le déclencheur n'est pas coché", () => {
    const hidden = computeVisibility(definition, {});
    expect(hidden.visibleFieldIds.has("liste_medicaments")).toBe(false);

    const shown = computeVisibility(definition, { traitement_en_cours: true });
    expect(shown.visibleFieldIds.has("liste_medicaments")).toBe(true);
  });

  it("efface les réponses devenues invisibles", () => {
    const { answers } = computeVisibility(definition, {
      traitement_en_cours: false,
      liste_medicaments: "Doliprane",
    });
    // Sans ce nettoyage, une réponse abandonnée en cours de route se
    // retrouverait dans le dossier signé.
    expect(answers.liste_medicaments).toBeUndefined();
  });

  it("propage le masquage en cascade jusqu'à stabilisation", () => {
    const { answers, visibleFieldIds } = computeVisibility(definition, {
      sexe: "m",
      grossesse: true,
      grossesse_semaines: 12,
    });
    // grossesse dépend de sexe=f ; grossesse_semaines dépend de grossesse.
    expect(visibleFieldIds.has("grossesse")).toBe(false);
    expect(answers.grossesse).toBeUndefined();
    expect(answers.grossesse_semaines).toBeUndefined();
  });
});

describe("validateAnswers", () => {
  it("n'exige pas les champs obligatoires qui sont masqués", () => {
    const result = validateAnswers(definition, {
      nom: "Bertrand",
      prenom: "Julien",
      date_naissance: "1979-03-14",
      sexe: "m",
      traitement_en_cours: false,
      anticoagulant: false,
      biphosphonates: false,
      a_des_allergies: false,
      pacemaker: false,
      tabac: false,
      anesthesie_probleme: false,
      motif: "Douleur molaire inférieure droite",
    });
    expect(result.errors).toEqual({});
    expect(result.valid).toBe(true);
  });

  it("refuse une valeur hors des options proposées", () => {
    const result = validateAnswers(definition, { sexe: "inconnu" });
    expect(result.errors.sexe).toBe("Choix invalide.");
  });

  it("refuse un nombre hors bornes", () => {
    const result = validateAnswers(definition, {
      sexe: "f",
      grossesse: true,
      grossesse_semaines: 99,
    });
    expect(result.errors.grossesse_semaines).toContain("Valeur maximale");
  });
});

describe("vigilance", () => {
  it("remonte les alertes critiques en tête", () => {
    const summary = computeVigilance(definition, {
      sexe: "f",
      anticoagulant: true,
      tabac: true,
      grossesse: true,
    });
    expect(summary.maxLevel).toBe("critical");
    expect(summary.alerts[0]?.level).toBe("critical");
    expect(summary.count).toBeGreaterThanOrEqual(3);
  });

  it("ne déclenche aucune alerte sur un champ que le patient n'a pas vu", () => {
    // sexe = m masque la question grossesse : la règle portée par ce champ ne
    // doit pas se déclencher, même si une réponse traîne.
    const summary = computeVigilance(definition, { sexe: "m", grossesse: true });
    expect(summary.alerts.some((alert) => alert.fieldId === "grossesse")).toBe(false);
  });

  it("formule les alertes de façon descriptive, jamais prescriptive", () => {
    const summary = computeVigilance(definition, { anticoagulant: true });
    const message = summary.alerts[0]?.message ?? "";
    expect(message).toMatch(/déclare/);
    expect(message).not.toMatch(/reporter|contre-indiqu|il faut/i);
  });
});

describe("intégrité des définitions de la bibliothèque", () => {
  it("ne contient ni doublon ni condition orpheline", () => {
    const definitions: FormDefinitionInput[] = [anamneseDentaire];
    for (const input of definitions) {
      expect(validateDefinitionIntegrity(parseFormDefinition(input))).toEqual([]);
    }
  });
});
