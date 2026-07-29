import { z } from "zod";

/**
 * Définition d'un formulaire Ryla.
 *
 * Une définition publiée est immuable et scellée par un hash : c'est elle qui
 * fait foi pour prouver *quel texte exact* le patient a lu et signé. Toute
 * modification crée une nouvelle version ; les dossiers déjà envoyés restent
 * rattachés à la version qu'ils ont réellement affichée.
 */

// ---------------------------------------------------------------------------
// Conditions (logique conditionnelle)
// ---------------------------------------------------------------------------

export const conditionOperators = [
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "answered",
  "empty",
] as const;

export type ConditionOperator = (typeof conditionOperators)[number];

export type Condition =
  | { field: string; op: ConditionOperator; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().min(1),
      op: z.enum(conditionOperators),
      value: z.unknown().optional(),
    }),
    z.object({ all: z.array(conditionSchema).min(1) }),
    z.object({ any: z.array(conditionSchema).min(1) }),
    z.object({ not: conditionSchema }),
  ]),
);

// ---------------------------------------------------------------------------
// Vigilance
//
// ⚠️  Contrainte réglementaire, pas stylistique : un message de vigilance
//     DÉCRIT ce que le patient a déclaré (« déclare prendre un anticoagulant »).
//     Il ne recommande jamais une conduite à tenir (« reporter l'intervention »).
//     Une aide à la décision clinique ferait basculer Ryla dans la catégorie
//     dispositif médical au sens du règlement (UE) 2017/745, avec marquage CE.
// ---------------------------------------------------------------------------

export const vigilanceLevels = ["info", "warning", "critical"] as const;
export type VigilanceLevel = (typeof vigilanceLevels)[number];

export const vigilanceRuleSchema = z.object({
  level: z.enum(vigilanceLevels),
  when: conditionSchema,
  /** Formulation descriptive, à la 3ᵉ personne. */
  message: z.string().min(1),
});

export type VigilanceRule = z.infer<typeof vigilanceRuleSchema>;

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

/** Traductions par code langue. Les réponses restent restituées en français. */
const i18nSchema = z
  .record(
    z.string(),
    z.object({
      label: z.string().optional(),
      help: z.string().optional(),
      options: z.record(z.string(), z.string()).optional(),
    }),
  )
  .optional();

const fieldBase = {
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "identifiant en minuscules, chiffres et _"),
  label: z.string().min(1),
  help: z.string().optional(),
  required: z.boolean().default(false),
  visibleIf: conditionSchema.optional(),
  vigilance: z.array(vigilanceRuleSchema).default([]),
  i18n: i18nSchema,
};

export const fieldSchema = z.discriminatedUnion("type", [
  z.object({ ...fieldBase, type: z.literal("text"), maxLength: z.number().int().positive().optional() }),
  z.object({ ...fieldBase, type: z.literal("textarea"), maxLength: z.number().int().positive().optional() }),
  z.object({ ...fieldBase, type: z.literal("email") }),
  z.object({ ...fieldBase, type: z.literal("phone") }),
  z.object({
    ...fieldBase,
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
  }),
  z.object({ ...fieldBase, type: z.literal("date"), min: z.string().optional(), max: z.string().optional() }),
  z.object({ ...fieldBase, type: z.literal("boolean") }),
  z.object({ ...fieldBase, type: z.literal("select"), options: z.array(optionSchema).min(1) }),
  z.object({ ...fieldBase, type: z.literal("multiselect"), options: z.array(optionSchema).min(1) }),
  z.object({
    ...fieldBase,
    type: z.literal("scale"),
    min: z.number().int().default(0),
    max: z.number().int().default(10),
    minLabel: z.string().optional(),
    maxLabel: z.string().optional(),
  }),
  /** Bloc de texte : information, avertissement, description d'acte. */
  z.object({ ...fieldBase, type: z.literal("info"), body: z.string().min(1) }),
  /**
   * Case de consentement. Distincte d'un booléen : l'horodatage de la coche et
   * le texte exact accepté entrent dans le faisceau de preuves.
   */
  z.object({ ...fieldBase, type: z.literal("consent"), statement: z.string().min(1) }),
  /** Droit à l'image, un champ par usage (dossier, site, réseaux sociaux…). */
  z.object({
    ...fieldBase,
    type: z.literal("photo_consent"),
    scope: z.enum([
      "dossier_medical",
      "site_web",
      "reseaux_sociaux",
      "publication_scientifique",
      "formation",
    ]),
    statement: z.string().min(1),
  }),
]);

export type FormField = z.infer<typeof fieldSchema>;
export type FieldType = FormField["type"];

/** Champs purement présentationnels : ils ne portent jamais de réponse. */
export const NON_ANSWERABLE_TYPES: ReadonlySet<FieldType> = new Set(["info"]);

// ---------------------------------------------------------------------------
// Sections et document
// ---------------------------------------------------------------------------

export const sectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  visibleIf: conditionSchema.optional(),
  fields: z.array(fieldSchema),
});

export type FormSection = z.infer<typeof sectionSchema>;

export const signatureBlockSchema = z.object({
  required: z.boolean().default(true),
  level: z.enum(["simple", "advanced", "qualified"]).default("simple"),
  signerRoles: z
    .array(z.enum(["patient", "legal_representative", "practitioner"]))
    .default(["patient"]),
  /** OTP par SMS : renforce la valeur probante de la signature simple. */
  requireOtp: z.boolean().default(false),
  /** Déclarations à cocher, horodatées individuellement. */
  statements: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        required: z.boolean().default(true),
      }),
    )
    .default([]),
});

export const formDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  intro: z.string().optional(),
  locale: z.string().default("fr"),
  /** Langues proposées au patient ; la restitution praticien reste en français. */
  availableLocales: z.array(z.string()).default(["fr"]),
  sections: z.array(sectionSchema).min(1),
  signature: signatureBlockSchema.optional(),
  legalNotice: z.string().optional(),
  /**
   * Délai de réflexion opposable, en jours. 15 pour la chirurgie esthétique
   * (art. D6322-30 CSP) — non dérogeable, même à la demande du patient.
   */
  reflectionPeriodDays: z.number().int().min(0).default(0),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/**
 * Forme « avant application des valeurs par défaut ».
 *
 * C'est le type qu'on écrit à la main (bibliothèque de modèles, imports) :
 * il autorise l'omission de `required`, `vigilance`, `locale`… que le parseur
 * remplira.
 */
export type FormDefinitionInput = z.input<typeof formDefinitionSchema>;

/** Une réponse patient : primitive, liste (multiselect) ou null. */
export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseFormDefinition(input: unknown): FormDefinition {
  return formDefinitionSchema.parse(input);
}

export function* iterateFields(
  definition: FormDefinition,
): Generator<{ section: FormSection; field: FormField }> {
  for (const section of definition.sections) {
    for (const field of section.fields) {
      yield { section, field };
    }
  }
}

export function findField(
  definition: FormDefinition,
  fieldId: string,
): FormField | undefined {
  for (const { field } of iterateFields(definition)) {
    if (field.id === fieldId) return field;
  }
  return undefined;
}

/**
 * Vérifie qu'aucun identifiant de champ ou de section n'est dupliqué et que
 * les conditions ne référencent que des champs existants.
 *
 * Une condition pointant vers un champ inexistant est toujours fausse : sans
 * ce contrôle, une faute de frappe masquerait silencieusement une question —
 * y compris une question de sécurité comme les allergies.
 */
export function validateDefinitionIntegrity(definition: FormDefinition): string[] {
  const errors: string[] = [];
  const fieldIds = new Set<string>();
  const sectionIds = new Set<string>();

  for (const section of definition.sections) {
    if (sectionIds.has(section.id)) {
      errors.push(`Section dupliquée : ${section.id}`);
    }
    sectionIds.add(section.id);
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        errors.push(`Champ dupliqué : ${field.id}`);
      }
      fieldIds.add(field.id);
    }
  }

  const checkCondition = (condition: Condition, origin: string): void => {
    if ("all" in condition) {
      condition.all.forEach((c) => checkCondition(c, origin));
    } else if ("any" in condition) {
      condition.any.forEach((c) => checkCondition(c, origin));
    } else if ("not" in condition) {
      checkCondition(condition.not, origin);
    } else if (!fieldIds.has(condition.field)) {
      errors.push(`${origin} référence un champ inconnu : ${condition.field}`);
    }
  };

  for (const section of definition.sections) {
    if (section.visibleIf) {
      checkCondition(section.visibleIf, `Section « ${section.title} »`);
    }
    for (const field of section.fields) {
      if (field.visibleIf) {
        checkCondition(field.visibleIf, `Champ « ${field.label} »`);
      }
      for (const rule of field.vigilance) {
        checkCondition(rule.when, `Vigilance de « ${field.label} »`);
      }
    }
  }

  return errors;
}
