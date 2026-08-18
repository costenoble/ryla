import { describe, expect, it } from "vitest";
import { formDefinitionSchema, validateDefinitionIntegrity } from "@/lib/form-schema";
import {
  dropDanglingConditions,
  emptyDraft,
  fieldId,
  toDefinition,
  toDraft,
  type SectionDraft,
} from "./types";

/**
 * Ce que ces tests protègent : l'éditeur ne doit jamais produire une définition
 * que le moteur de rendu refuserait, et rouvrir un modèle publié ne doit pas en
 * altérer le contenu — sinon un simple aller-retour dans l'éditeur changerait
 * silencieusement le texte qu'un patient a signé.
 */

describe("fieldId", () => {
  it("dérive un identifiant technique de l'intitulé", () => {
    expect(fieldId("Prenez-vous un anticoagulant ?", new Set())).toBe(
      "prenez_vous_un_anticoagulant",
    );
  });

  it("retire les accents", () => {
    expect(fieldId("Antécédents médicaux", new Set())).toBe("antecedents_medicaux");
  });

  it("évite les collisions", () => {
    expect(fieldId("Allergie", new Set(["allergie"]))).toBe("allergie_2");
    expect(fieldId("Allergie", new Set(["allergie", "allergie_2"]))).toBe("allergie_3");
  });

  it("ne commence jamais par un chiffre", () => {
    expect(fieldId("3 repas par jour", new Set())).toMatch(/^[a-z]/);
  });

  it("tombe sur un identifiant par défaut plutôt que sur une chaîne vide", () => {
    expect(fieldId("???", new Set())).toBe("question");
    expect(fieldId("", new Set())).toBe("question");
  });
});

describe("dropDanglingConditions", () => {
  const sections = (): SectionDraft[] => [
    {
      id: "s1",
      title: "Antécédents",
      fields: [
        { id: "anticoagulant", type: "boolean", label: "Anticoagulant ?" },
        {
          id: "lequel",
          type: "text",
          label: "Lequel ?",
          visibleIf: { field: "anticoagulant", op: "eq", value: true },
        },
        {
          id: "allergie_detail",
          type: "text",
          label: "Détaillez",
          visibleIf: { field: "allergie", op: "eq", value: true },
        },
      ],
    },
  ];

  it("libère la question dont la condition visait un champ supprimé", () => {
    const result = dropDanglingConditions(sections(), ["anticoagulant"]);
    expect(result[0]!.fields[1]!.visibleIf).toBeUndefined();
  });

  it("laisse intactes les conditions qui visent un champ encore présent", () => {
    const result = dropDanglingConditions(sections(), ["anticoagulant"]);
    expect(result[0]!.fields[2]!.visibleIf).toEqual({
      field: "allergie",
      op: "eq",
      value: true,
    });
  });

  it("ne touche à rien quand aucune suppression n'a eu lieu", () => {
    const input = sections();
    expect(dropDanglingConditions(input, [])).toBe(input);
  });

  it("produit une définition acceptée par le contrôle d'intégrité", () => {
    // Sans nettoyage, la condition orpheline ferait échouer l'enregistrement.
    const draft = emptyDraft();
    draft.sections = dropDanglingConditions(sections(), ["anticoagulant", "allergie"]);
    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    expect(validateDefinitionIntegrity(parsed)).toEqual([]);
  });
});

describe("toDefinition", () => {
  it("produit une définition valide à partir du modèle de départ", () => {
    const parsed = formDefinitionSchema.parse(toDefinition(emptyDraft()));
    expect(validateDefinitionIntegrity(parsed)).toEqual([]);
  });

  it("écarte les déclarations de signature laissées vides", () => {
    const draft = emptyDraft();
    draft.statements.push({ id: "vide", text: "   ", required: true });
    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    expect(parsed.signature?.statements.map((s) => s.id)).toEqual(["sincerite"]);
  });

  it("écarte les vigilances sans message", () => {
    const draft = emptyDraft();
    draft.sections[0]!.fields.push({
      id: "anticoagulant",
      type: "boolean",
      label: "Prenez-vous un anticoagulant ?",
      vigilance: [
        { level: "critical", value: true, message: "Anticoagulant déclaré" },
        { level: "warning", value: true, message: "  " },
      ],
    });

    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    const field = parsed.sections[0]!.fields.find((f) => f.id === "anticoagulant")!;
    expect(field.vigilance).toHaveLength(1);
    expect(field.vigilance![0]!.message).toBe("Anticoagulant déclaré");
  });

  it("ancre la condition de vigilance sur le champ qui la porte", () => {
    const draft = emptyDraft();
    draft.sections[0]!.fields.push({
      id: "grossesse",
      type: "boolean",
      label: "Êtes-vous enceinte ?",
      vigilance: [{ level: "warning", value: true, message: "Grossesse déclarée" }],
    });

    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    const field = parsed.sections[0]!.fields.find((f) => f.id === "grossesse")!;
    expect(field.vigilance![0]!.when).toEqual({
      field: "grossesse",
      op: "eq",
      value: true,
    });
  });

  it("ne laisse jamais une question d'information obligatoire", () => {
    const draft = emptyDraft();
    draft.sections[0]!.fields.push({
      id: "avertissement",
      type: "info",
      label: "Avertissement",
      body: "Ce document ne remplace pas la consultation.",
      required: true,
    });

    const parsed = formDefinitionSchema.parse(toDefinition(draft));
    const field = parsed.sections[0]!.fields.find((f) => f.id === "avertissement")!;
    expect(field.required).toBe(false);
  });
});

describe("aller-retour toDraft / toDefinition", () => {
  it("préserve la définition à l'identique", () => {
    const draft = emptyDraft();
    draft.intro = "Merci de répondre avec précision.";
    draft.sections[0]!.fields.push(
      {
        id: "anticoagulant",
        type: "boolean",
        label: "Prenez-vous un anticoagulant ?",
        required: true,
        vigilance: [
          { level: "critical", value: true, message: "Anticoagulant déclaré" },
        ],
      },
      {
        id: "lequel",
        type: "text",
        label: "Lequel ?",
        visibleIf: { field: "anticoagulant", op: "eq", value: true },
      },
      {
        id: "douleur",
        type: "scale",
        label: "Niveau de douleur",
        min: 0,
        max: 10,
      },
      {
        id: "tabac",
        type: "select",
        label: "Consommation de tabac",
        options: [
          { value: "non", label: "Non" },
          { value: "occasionnel", label: "Occasionnel" },
        ],
      },
    );

    const first = formDefinitionSchema.parse(toDefinition(draft));
    const second = formDefinitionSchema.parse(toDefinition(toDraft(first)));

    expect(second).toEqual(first);
  });

  it("garde intacte une définition venue de la bibliothèque", () => {
    const source = formDefinitionSchema.parse({
      schemaVersion: 1,
      title: "Consentement implantologie",
      locale: "fr",
      availableLocales: ["fr"],
      reflectionPeriodDays: 15,
      legalNotice: "Article L1111-2 du code de la santé publique.",
      sections: [
        {
          id: "risques",
          title: "Risques",
          fields: [
            {
              id: "info_risques",
              type: "info",
              label: "Risques opératoires",
              body: "Une intervention comporte des risques.",
              required: false,
            },
            {
              id: "compris",
              type: "consent",
              label: "Compréhension",
              statement: "J'ai compris les risques exposés ci-dessus.",
              required: true,
            },
            {
              id: "image",
              type: "photo_consent",
              label: "Photographies",
              statement: "J'autorise l'usage de photographies.",
              scope: "publication_scientifique",
              required: false,
            },
          ],
        },
      ],
      signature: {
        required: true,
        level: "simple",
        signerRoles: ["patient"],
        requireOtp: false,
        statements: [{ id: "lu", text: "J'ai lu et compris.", required: true }],
      },
    });

    expect(formDefinitionSchema.parse(toDefinition(toDraft(source)))).toEqual(source);
  });
});
