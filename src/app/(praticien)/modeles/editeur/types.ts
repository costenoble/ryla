import type { FormDefinition } from "@/lib/form-schema";

/**
 * Types de travail de l'éditeur.
 *
 * Volontairement plus permissifs que `FormDefinition` : pendant l'édition, un
 * champ peut être incomplet — un intitulé vide, une liste d'options en cours de
 * saisie. La conversion vers le format strict n'a lieu qu'à l'enregistrement,
 * où le schéma zod tranche.
 */

export type VigilanceDraft = {
  level: "info" | "warning" | "critical";
  /** Réponse qui déclenche l'alerte. Limité au Oui / Non côté saisie. */
  value: boolean;
  message: string;
};

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  | "scale"
  | "info"
  | "consent"
  | "photo_consent";

export type FormFieldDraft = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  unit?: string;
  body?: string;
  statement?: string;
  scope?:
    | "dossier_medical"
    | "site_web"
    | "reseaux_sociaux"
    | "publication_scientifique"
    | "formation";
  visibleIf?: { field: string; op: "eq"; value: boolean };
  vigilance?: VigilanceDraft[];
};

export type SectionDraft = {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldDraft[];
};

export type StatementDraft = {
  id: string;
  text: string;
  required: boolean;
};

export type TemplateDraft = {
  title: string;
  intro?: string;
  sections: SectionDraft[];
  statements: StatementDraft[];
  legalNotice?: string;
  reflectionPeriodDays: number;
};

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "boolean", label: "Oui / Non" },
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "select", label: "Choix unique" },
  { value: "multiselect", label: "Choix multiples" },
  { value: "number", label: "Nombre" },
  { value: "scale", label: "Échelle" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Téléphone" },
  { value: "info", label: "Texte d'information" },
  { value: "consent", label: "Case de consentement" },
  { value: "photo_consent", label: "Droit à l'image" },
];

export function needsOptions(type: FieldType): boolean {
  return type === "select" || type === "multiselect";
}

/**
 * Une alerte se déclenche sur un Oui / Non.
 *
 * Les autres types accepteraient des conditions plus riches côté format, mais
 * les exposer à la saisie demanderait un éditeur de conditions complet pour un
 * gain marginal : en pratique, une vigilance se déclenche sur une déclaration
 * binaire (« prenez-vous un anticoagulant ? »).
 */
export function supportsVigilance(type: FieldType): boolean {
  return type === "boolean";
}

/** Identifiant technique stable, dérivé de l'intitulé. */
export function fieldId(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "q$1")
      .slice(0, 40) || "question";

  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Retire les conditions devenues orphelines après une suppression.
 *
 * Sans cela, une question garderait un `visibleIf` pointant dans le vide : le
 * contrôle d'intégrité refuserait l'enregistrement, et le praticien lirait un
 * message parlant d'un champ qu'il vient justement de supprimer. La question
 * redevient simplement visible, ce qui est le comportement le moins dangereux —
 * une question de sécurité masquée par erreur serait bien pire.
 */
export function dropDanglingConditions(
  sections: SectionDraft[],
  removedIds: string[],
): SectionDraft[] {
  if (removedIds.length === 0) return sections;
  const gone = new Set(removedIds);

  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) =>
      field.visibleIf && gone.has(field.visibleIf.field)
        ? { ...field, visibleIf: undefined }
        : field,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Définition publiée → brouillon éditable. */
export function toDraft(definition: FormDefinition): TemplateDraft {
  return {
    title: definition.title,
    intro: definition.intro,
    legalNotice: definition.legalNotice,
    reflectionPeriodDays: definition.reflectionPeriodDays,
    statements: (definition.signature?.statements ?? []).map((statement) => ({
      id: statement.id,
      text: statement.text,
      required: statement.required,
    })),
    sections: definition.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      fields: section.fields.map((field) => {
        const draft: FormFieldDraft = {
          id: field.id,
          type: field.type as FieldType,
          label: field.label,
          help: field.help,
          required: field.required,
        };
        if ("options" in field) draft.options = field.options;
        if ("min" in field && typeof field.min === "number") draft.min = field.min;
        if ("max" in field && typeof field.max === "number") draft.max = field.max;
        if ("unit" in field) draft.unit = field.unit;
        if ("body" in field) draft.body = field.body;
        if ("statement" in field) draft.statement = field.statement;
        if ("scope" in field) draft.scope = field.scope;

        // Seules les conditions simples sont réexposées à la saisie ; une
        // condition composée reste dans la définition et continue d'être
        // appliquée au rendu, mais l'éditeur ne prétend pas la modifier.
        if (field.visibleIf && "field" in field.visibleIf && field.visibleIf.op === "eq") {
          draft.visibleIf = {
            field: field.visibleIf.field,
            op: "eq",
            value: field.visibleIf.value === true,
          };
        }

        draft.vigilance = (field.vigilance ?? [])
          .filter((rule) => "field" in rule.when && rule.when.op === "eq")
          .map((rule) => ({
            level: rule.level,
            value: (rule.when as { value?: unknown }).value === true,
            message: rule.message,
          }));

        return draft;
      }),
    })),
  };
}

/** Brouillon → définition, telle qu'elle sera validée puis publiée. */
export function toDefinition(draft: TemplateDraft): unknown {
  return {
    schemaVersion: 1,
    title: draft.title.trim(),
    intro: draft.intro?.trim() || undefined,
    locale: "fr",
    availableLocales: ["fr"],
    legalNotice: draft.legalNotice?.trim() || undefined,
    reflectionPeriodDays: draft.reflectionPeriodDays,
    sections: draft.sections.map((section) => ({
      id: section.id,
      title: section.title.trim(),
      description: section.description?.trim() || undefined,
      fields: section.fields.map((field) => {
        const base: Record<string, unknown> = {
          id: field.id,
          type: field.type,
          label: field.label.trim(),
          help: field.help?.trim() || undefined,
          required: field.type === "info" ? false : (field.required ?? false),
          vigilance: (field.vigilance ?? [])
            .filter((rule) => rule.message.trim() !== "")
            .map((rule) => ({
              level: rule.level,
              when: { field: field.id, op: "eq", value: rule.value },
              message: rule.message.trim(),
            })),
        };

        if (field.visibleIf) {
          base.visibleIf = {
            field: field.visibleIf.field,
            op: "eq",
            value: field.visibleIf.value,
          };
        }
        if (needsOptions(field.type)) base.options = field.options ?? [];
        if (field.type === "info") base.body = field.body?.trim() ?? "";
        if (field.type === "consent" || field.type === "photo_consent") {
          base.statement = field.statement?.trim() ?? "";
        }
        if (field.type === "photo_consent") base.scope = field.scope ?? "dossier_medical";
        if (field.type === "number") {
          if (field.min !== undefined) base.min = field.min;
          if (field.max !== undefined) base.max = field.max;
          if (field.unit) base.unit = field.unit;
        }
        if (field.type === "scale") {
          base.min = field.min ?? 0;
          base.max = field.max ?? 10;
        }
        return base;
      }),
    })),
    signature: {
      required: true,
      level: "simple",
      signerRoles: ["patient"],
      requireOtp: false,
      statements: draft.statements
        .filter((statement) => statement.text.trim() !== "")
        .map((statement) => ({
          id: statement.id,
          text: statement.text.trim(),
          required: statement.required,
        })),
    },
  };
}

/** Modèle de départ pour un formulaire créé de zéro. */
export function emptyDraft(): TemplateDraft {
  return {
    title: "Nouveau questionnaire",
    intro: "",
    reflectionPeriodDays: 0,
    sections: [
      {
        id: "section_1",
        title: "Vos informations",
        fields: [
          { id: "nom", type: "text", label: "Nom", required: true },
          { id: "prenom", type: "text", label: "Prénom", required: true },
        ],
      },
    ],
    statements: [
      {
        id: "sincerite",
        text: "Je certifie que les informations communiquées sont exactes et complètes.",
        required: true,
      },
    ],
  };
}
