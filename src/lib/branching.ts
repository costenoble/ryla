import {
  NON_ANSWERABLE_TYPES,
  type Answers,
  type AnswerValue,
  type Condition,
  type FormDefinition,
  type FormField,
  type FormSection,
} from "./form-schema";

/**
 * Moteur de logique conditionnelle.
 *
 * Fonctions pures, sans accès base ni réseau : c'est le même code qui décide
 * de l'affichage côté patient et qui recalcule la visibilité côté serveur au
 * moment de valider. Un client modifié ne peut donc pas glisser de réponse à
 * une question qui ne lui était pas posée.
 */

// ---------------------------------------------------------------------------
// Évaluation des conditions
// ---------------------------------------------------------------------------

function isBlank(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Comparaison ordonnée. Deux valeurs numériques se comparent numériquement,
 * tout le reste lexicalement — ce qui traite correctement les dates ISO
 * (`2026-02-01` > `2026-01-31`) sans convertir quoi que ce soit.
 */
function compare(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric =
    left !== "" &&
    right !== "" &&
    left !== null &&
    right !== null &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber);

  if (bothNumeric) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function looseEquals(answer: AnswerValue | undefined, expected: unknown): boolean {
  if (Array.isArray(answer)) {
    return Array.isArray(expected)
      ? answer.length === expected.length &&
          answer.every((item) => expected.includes(item))
      : answer.length === 1 && answer[0] === String(expected);
  }
  if (typeof answer === "boolean" || typeof expected === "boolean") {
    return Boolean(answer) === Boolean(expected);
  }
  if (answer === null || answer === undefined) return expected === null;
  return String(answer) === String(expected);
}

export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  if ("all" in condition) {
    return condition.all.every((child) => evaluateCondition(child, answers));
  }
  if ("any" in condition) {
    return condition.any.some((child) => evaluateCondition(child, answers));
  }
  if ("not" in condition) {
    return !evaluateCondition(condition.not, answers);
  }

  const answer = answers[condition.field];
  const expected = condition.value;

  switch (condition.op) {
    case "answered":
      return !isBlank(answer);
    case "empty":
      return isBlank(answer);
    case "eq":
      return looseEquals(answer, expected);
    case "neq":
      return !looseEquals(answer, expected);
    case "in": {
      if (!Array.isArray(expected)) return false;
      if (Array.isArray(answer)) return answer.some((item) => expected.includes(item));
      return expected.some((item) => looseEquals(answer, item));
    }
    case "nin": {
      if (!Array.isArray(expected)) return true;
      if (Array.isArray(answer)) return !answer.some((item) => expected.includes(item));
      return !expected.some((item) => looseEquals(answer, item));
    }
    case "contains": {
      if (isBlank(answer)) return false;
      if (Array.isArray(answer)) return answer.includes(String(expected));
      return String(answer).toLowerCase().includes(String(expected).toLowerCase());
    }
    case "gt":
      return !isBlank(answer) && compare(answer, expected) > 0;
    case "gte":
      return !isBlank(answer) && compare(answer, expected) >= 0;
    case "lt":
      return !isBlank(answer) && compare(answer, expected) < 0;
    case "lte":
      return !isBlank(answer) && compare(answer, expected) <= 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Visibilité
// ---------------------------------------------------------------------------

export type VisibleSection = {
  section: FormSection;
  fields: FormField[];
};

export type Visibility = {
  sections: VisibleSection[];
  visibleFieldIds: Set<string>;
  /** Réponses débarrassées de celles des champs devenus invisibles. */
  answers: Answers;
};

function visibilityPass(
  definition: FormDefinition,
  answers: Answers,
): { sections: VisibleSection[]; visibleFieldIds: Set<string> } {
  const sections: VisibleSection[] = [];
  const visibleFieldIds = new Set<string>();

  for (const section of definition.sections) {
    if (section.visibleIf && !evaluateCondition(section.visibleIf, answers)) {
      continue;
    }
    const fields = section.fields.filter(
      (field) => !field.visibleIf || evaluateCondition(field.visibleIf, answers),
    );
    for (const field of fields) {
      visibleFieldIds.add(field.id);
    }
    sections.push({ section, fields });
  }

  return { sections, visibleFieldIds };
}

/**
 * Calcule la visibilité en point fixe.
 *
 * Masquer un champ efface sa réponse, ce qui peut masquer un champ en aval.
 * Il faut donc itérer jusqu'à stabilisation : un patient qui coche « je fume »,
 * répond aux questions de suivi, puis décoche, ne doit pas laisser derrière lui
 * des réponses orphelines qui apparaîtraient dans le dossier signé.
 */
export function computeVisibility(
  definition: FormDefinition,
  answers: Answers,
): Visibility {
  const answerable = new Set<string>();
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (!NON_ANSWERABLE_TYPES.has(field.type)) answerable.add(field.id);
    }
  }

  let current: Answers = { ...answers };
  let pass = visibilityPass(definition, current);

  for (let i = 0; i < 20; i += 1) {
    const next: Answers = {};
    for (const [key, value] of Object.entries(current)) {
      if (pass.visibleFieldIds.has(key) && answerable.has(key)) {
        next[key] = value;
      }
    }
    const stable =
      Object.keys(next).length === Object.keys(current).length &&
      Object.keys(next).every((key) => key in current);
    current = next;
    if (stable) break;
    pass = visibilityPass(definition, current);
  }

  return { sections: pass.sections, visibleFieldIds: pass.visibleFieldIds, answers: current };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult = {
  valid: boolean;
  /** Message par identifiant de champ. */
  errors: Record<string, string>;
  /** Réponses nettoyées, prêtes à être chiffrées et stockées. */
  answers: Answers;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAnswers(
  definition: FormDefinition,
  rawAnswers: Answers,
): ValidationResult {
  const { sections, answers } = computeVisibility(definition, rawAnswers);
  const errors: Record<string, string> = {};

  for (const { fields } of sections) {
    for (const field of fields) {
      if (NON_ANSWERABLE_TYPES.has(field.type)) continue;
      const value = answers[field.id];
      const blank = isBlank(value);

      if (field.required && blank) {
        errors[field.id] =
          field.type === "consent" || field.type === "photo_consent"
            ? "Vous devez cocher cette case pour continuer."
            : "Cette question est obligatoire.";
        continue;
      }
      if (blank) continue;

      switch (field.type) {
        case "email":
          if (!EMAIL_RE.test(String(value))) {
            errors[field.id] = "Adresse email invalide.";
          }
          break;
        case "date":
          if (!DATE_RE.test(String(value))) {
            errors[field.id] = "Date attendue au format JJ/MM/AAAA.";
          } else if (field.min && compare(value, field.min) < 0) {
            errors[field.id] = "Date antérieure à la valeur autorisée.";
          } else if (field.max && compare(value, field.max) > 0) {
            errors[field.id] = "Date postérieure à la valeur autorisée.";
          }
          break;
        case "number": {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            errors[field.id] = "Valeur numérique attendue.";
          } else if (field.min !== undefined && numeric < field.min) {
            errors[field.id] = `Valeur minimale : ${field.min}.`;
          } else if (field.max !== undefined && numeric > field.max) {
            errors[field.id] = `Valeur maximale : ${field.max}.`;
          }
          break;
        }
        case "scale": {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric < field.min || numeric > field.max) {
            errors[field.id] = `Valeur attendue entre ${field.min} et ${field.max}.`;
          }
          break;
        }
        case "select":
          if (!field.options.some((option) => option.value === String(value))) {
            errors[field.id] = "Choix invalide.";
          }
          break;
        case "multiselect": {
          const list = Array.isArray(value) ? value : [String(value)];
          const allowed = new Set(field.options.map((option) => option.value));
          if (!list.every((item) => allowed.has(item))) {
            errors[field.id] = "Choix invalide.";
          }
          break;
        }
        case "text":
        case "textarea":
          if (field.maxLength && String(value).length > field.maxLength) {
            errors[field.id] = `${field.maxLength} caractères maximum.`;
          }
          break;
        case "consent":
        case "photo_consent":
          if (field.required && value !== true) {
            errors[field.id] = "Vous devez cocher cette case pour continuer.";
          }
          break;
        default:
          break;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, answers };
}
