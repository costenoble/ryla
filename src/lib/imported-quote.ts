import type { FormDefinitionInput } from "./form-schema";
import { REFLECTION_DAYS_ESTHETIQUE } from "./reflection";

/**
 * Modèle de signature d'un document importé.
 *
 * Le devis vient du logiciel métier du cabinet : Ryla n'a rien à dire sur son
 * contenu, et surtout rien à y réécrire. Le formulaire ne porte donc aucune
 * question — juste le cadre de lecture et les déclarations que le patient
 * coche, une par une et horodatées.
 *
 * C'est ce qui donne au devis importé exactement la même valeur probante qu'un
 * document Ryla : même mesure du temps de lecture, même faisceau, même chaîne
 * d'audit. La seule différence est que la pièce affichée est un PDF plutôt
 * qu'un questionnaire.
 */

export const IMPORTED_QUOTE_KEY = "devis-importe";

/**
 * Deux jeux de déclarations, parce que les deux régimes n'engagent pas à la
 * même chose : un devis conventionnel dentaire porte sur un reste à charge,
 * un devis esthétique ouvre un délai de réflexion d'ordre public.
 */
export function importedQuoteDefinition(
  kind: "dentaire" | "esthetique",
): FormDefinitionInput {
  const esthetique = kind === "esthetique";

  return {
    schemaVersion: 1,
    title: esthetique
      ? "Devis de chirurgie esthétique — prise de connaissance"
      : "Devis — prise de connaissance",
    intro:
      "Votre praticien vous transmet un devis. Prenez le temps de le lire " +
      "entièrement avant de le signer : le temps de lecture est enregistré et " +
      "fait partie du dossier conservé par le cabinet.",
    locale: "fr",
    availableLocales: ["fr"],
    // Le délai est porté par le devis lui-même, pas par le formulaire ; il est
    // rappelé ici pour que le patient le lise avant de signer.
    reflectionPeriodDays: esthetique ? REFLECTION_DAYS_ESTHETIQUE : 0,
    sections: [
      {
        id: "lecture",
        title: "Le devis",
        description:
          "Le document ci-dessous est celui établi par votre cabinet. Faites " +
          "défiler l'ensemble des pages.",
        fields: [
          {
            id: "piece_jointe",
            type: "info",
            label: "Devis transmis par le cabinet",
            body:
              "Le devis est affiché ci-dessus. Si vous n'arrivez pas à le lire, " +
              "téléchargez-le avec le lien prévu à cet effet, ou contactez le " +
              "cabinet plutôt que de signer un document que vous n'avez pas pu " +
              "consulter.",
          },
        ],
      },
      {
        id: "questions",
        title: "Vos questions",
        description:
          "Facultatif. Ce que vous écrivez ici est transmis au cabinet avec votre signature.",
        fields: [
          {
            id: "remarques",
            type: "textarea",
            label: "Remarques ou questions sur ce devis",
            required: false,
            maxLength: 2000,
          },
        ],
      },
    ],
    signature: {
      required: true,
      level: "simple",
      signerRoles: ["patient"],
      requireOtp: false,
      statements: esthetique
        ? [
            {
              id: "lecture_integrale",
              text: "J'ai pris connaissance de l'intégralité du devis qui m'a été transmis.",
              required: true,
            },
            {
              id: "montants",
              text:
                "J'ai compris le montant total des honoraires et la somme restant " +
                "à ma charge.",
              required: true,
            },
            {
              id: "delai_reflexion",
              text:
                `J'ai été informé(e) qu'un délai de réflexion de ${REFLECTION_DAYS_ESTHETIQUE} ` +
                "jours court à compter de la remise de ce devis (art. D6322-30 du code " +
                "de la santé publique), et qu'aucune intervention ne peut être " +
                "programmée avant son terme.",
              required: true,
            },
            {
              id: "questions_posees",
              text:
                "J'ai pu poser les questions que je souhaitais et j'ai reçu des " +
                "réponses que j'ai comprises.",
              required: true,
            },
          ]
        : [
            {
              id: "lecture_integrale",
              text: "J'ai pris connaissance de l'intégralité du devis qui m'a été transmis.",
              required: true,
            },
            {
              id: "montants",
              text:
                "J'ai compris le montant total des honoraires et la somme restant " +
                "à ma charge après remboursements.",
              required: true,
            },
            {
              id: "alternative",
              text:
                "J'ai été informé(e) de l'existence, le cas échéant, d'une " +
                "alternative thérapeutique sans reste à charge.",
              required: true,
            },
          ],
    },
    legalNotice:
      "Ce document constitue la signature électronique du devis annexé. Le devis " +
      "d'origine est reproduit intégralement et n'a fait l'objet d'aucune " +
      "modification par Ryla.",
  };
}
