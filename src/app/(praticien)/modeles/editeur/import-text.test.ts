import { describe, expect, it } from "vitest";
import { formDefinitionSchema, validateDefinitionIntegrity } from "@/lib/form-schema";
import { draftFromText, summarizeDraft } from "./import-text";
import { toDefinition } from "./types";

/**
 * L'analyse se trompera parfois — c'est admis, le praticien corrige ensuite.
 * Ce qui ne doit jamais arriver, c'est qu'elle produise un formulaire que
 * l'éditeur refuserait d'enregistrer, ou qu'elle perde une question.
 */

const SOURCE = `QUESTIONNAIRE MÉDICAL

ANTÉCÉDENTS

1. Êtes-vous suivi(e) pour une maladie chronique ?
2. Prenez-vous un traitement anticoagulant ?
Quel est votre groupe sanguin :

ALLERGIES

Avez-vous des allergies connues ?
- Pénicilline
- Latex
- Anesthésiques locaux

Les informations recueillies dans ce questionnaire sont couvertes par le secret médical et ne seront utilisées que dans le cadre de votre prise en charge par le cabinet.`;

describe("draftFromText", () => {
  const draft = draftFromText(SOURCE, "Anamnèse du cabinet");

  it("prend le titre fourni plutôt que la première ligne", () => {
    expect(draft.title).toBe("Anamnèse du cabinet");
  });

  it("retombe sur la première ligne quand aucun titre n'est donné", () => {
    expect(draftFromText(SOURCE).title).toBe("QUESTIONNAIRE MÉDICAL");
  });

  it("ouvre une section sur les lignes en majuscules", () => {
    expect(draft.sections.map((section) => section.title)).toEqual([
      "Questionnaire médical",
      "Antécédents",
      "Allergies",
    ]);
  });

  it("retire la numérotation des intitulés", () => {
    const labels = draft.sections[1]!.fields.map((field) => field.label);
    expect(labels).toContain("Êtes-vous suivi(e) pour une maladie chronique ?");
    expect(labels.some((label) => label.startsWith("1."))).toBe(false);
  });

  it("fait des questions en « ? » des Oui / Non", () => {
    const field = draft.sections[1]!.fields.find((f) =>
      f.label.startsWith("Prenez-vous"),
    )!;
    expect(field.type).toBe("boolean");
  });

  it("fait des lignes en « : » des réponses libres, sans les deux-points", () => {
    const field = draft.sections[1]!.fields.find((f) => f.label.startsWith("Quel"))!;
    expect(field.type).toBe("text");
    expect(field.label).toBe("Quel est votre groupe sanguin");
  });

  it("transforme une question suivie de puces en choix unique", () => {
    const field = draft.sections[2]!.fields[0]!;
    expect(field.type).toBe("select");
    expect(field.options?.map((option) => option.label)).toEqual([
      "Pénicilline",
      "Latex",
      "Anesthésiques locaux",
    ]);
  });

  it("garde les paragraphes explicatifs comme information, pas comme question", () => {
    const info = draft.sections[2]!.fields.find((f) => f.type === "info");
    expect(info?.body).toContain("secret médical");
  });

  it("donne des identifiants techniques uniques", () => {
    const ids = draft.sections.flatMap((s) => s.fields.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produit une définition que l'éditeur accepte", () => {
    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    expect(validateDefinitionIntegrity(parsed)).toEqual([]);
  });

  it("survit à un texte vide", () => {
    const empty = draftFromText("");
    expect(empty.sections).toHaveLength(1);
    const parsed = formDefinitionSchema.parse(toDefinition(empty));
    expect(validateDefinitionIntegrity(parsed)).toEqual([]);
  });

  it("rattache les questions posées avant tout titre", () => {
    const draft = draftFromText("Avez-vous mal ?\nDepuis quand :");
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]!.fields).toHaveLength(2);
  });
});

describe("summarizeDraft", () => {
  it("compte ce qui a été reconnu", () => {
    expect(summarizeDraft(draftFromText(SOURCE))).toEqual({
      sections: 3,
      questions: 4,
      choices: 1,
      infos: 1,
    });
  });
});
