import { computeVisibility, evaluateCondition } from "./branching";
import {
  vigilanceLevels,
  type Answers,
  type FormDefinition,
  type VigilanceLevel,
} from "./form-schema";

/**
 * Alertes de vigilance.
 *
 * C'est la fonctionnalité qui fait adopter le produit par un chirurgien : le
 * bandeau rouge en tête de fiche qui signale un anticoagulant ou une allergie
 * sans avoir à relire quatre pages.
 *
 * Et c'est aussi la fonctionnalité la plus risquée juridiquement. Ryla
 * restitue une déclaration du patient ; il ne qualifie pas un risque et ne
 * propose aucune conduite à tenir. Franchir cette ligne, c'est produire une
 * aide à la décision clinique, donc un dispositif médical au sens du
 * règlement (UE) 2017/745 — marquage CE, organisme notifié, autre métier.
 */

export type VigilanceAlert = {
  fieldId: string;
  fieldLabel: string;
  sectionTitle: string;
  level: VigilanceLevel;
  message: string;
};

export type VigilanceSummary = {
  alerts: VigilanceAlert[];
  count: number;
  maxLevel: VigilanceLevel | null;
};

const LEVEL_ORDER: Record<VigilanceLevel, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function computeVigilance(
  definition: FormDefinition,
  rawAnswers: Answers,
): VigilanceSummary {
  // On repart de la visibilité calculée : une règle portée par un champ que le
  // patient n'a jamais vu ne doit pas déclencher d'alerte.
  const { sections, answers } = computeVisibility(definition, rawAnswers);
  const alerts: VigilanceAlert[] = [];

  for (const { section, fields } of sections) {
    for (const field of fields) {
      for (const rule of field.vigilance) {
        if (evaluateCondition(rule.when, answers)) {
          alerts.push({
            fieldId: field.id,
            fieldLabel: field.label,
            sectionTitle: section.title,
            level: rule.level,
            message: rule.message,
          });
        }
      }
    }
  }

  alerts.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);

  return {
    alerts,
    count: alerts.length,
    maxLevel: alerts[0]?.level ?? null,
  };
}

export function levelRank(level: VigilanceLevel): number {
  return LEVEL_ORDER[level];
}

export function isVigilanceLevel(value: unknown): value is VigilanceLevel {
  return (
    typeof value === "string" && (vigilanceLevels as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Garde-fou rédactionnel
// ---------------------------------------------------------------------------

/**
 * Tournures qui font glisser un message descriptif vers la prescription.
 * Liste volontairement courte et lisible : elle sert d'avertissement dans
 * l'éditeur, pas de censeur — l'auteur reste libre de passer outre.
 */
const PRESCRIPTIVE_MARKERS: { pattern: RegExp; hint: string }[] = [
  { pattern: /\bil faut\b/i, hint: "« il faut »" },
  { pattern: /\bvous devez\b/i, hint: "« vous devez »" },
  { pattern: /\bne pas op[ée]rer\b/i, hint: "« ne pas opérer »" },
  { pattern: /\breporter\b/i, hint: "« reporter »" },
  { pattern: /\bdiff[ée]rer\b/i, hint: "« différer »" },
  { pattern: /\bannuler\b/i, hint: "« annuler »" },
  { pattern: /\bcontre-indiqu/i, hint: "« contre-indiqué »" },
  { pattern: /\bprescri/i, hint: "« prescrire »" },
  { pattern: /\brecommand/i, hint: "« recommandé »" },
  { pattern: /\bar+[êe]ter le traitement\b/i, hint: "« arrêter le traitement »" },
  { pattern: /\bconduite [àa] tenir\b/i, hint: "« conduite à tenir »" },
];

export type PhrasingWarning = {
  fieldId: string;
  message: string;
  reason: string;
};

/**
 * Signale les messages de vigilance formulés comme une recommandation.
 * Non bloquant : renvoie des avertissements affichés dans l'éditeur.
 */
export function checkDescriptivePhrasing(
  definition: FormDefinition,
): PhrasingWarning[] {
  const warnings: PhrasingWarning[] = [];

  for (const section of definition.sections) {
    for (const field of section.fields) {
      for (const rule of field.vigilance) {
        const marker = PRESCRIPTIVE_MARKERS.find((entry) =>
          entry.pattern.test(rule.message),
        );
        if (marker) {
          warnings.push({
            fieldId: field.id,
            message: rule.message,
            reason:
              `Formulation prescriptive détectée (${marker.hint}). Préférez une ` +
              `description de ce que le patient déclare : une recommandation de ` +
              `conduite à tenir relève du dispositif médical (MDR 2017/745).`,
          });
        }
      }
    }
  }

  return warnings;
}
