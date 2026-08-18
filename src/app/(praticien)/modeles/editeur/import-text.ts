import { fieldId, type FieldType, type FormFieldDraft, type SectionDraft, type TemplateDraft } from "./types";

/**
 * Import d'un questionnaire existant par copier-coller.
 *
 * Un cabinet qui passe au numérique arrive avec son questionnaire papier, en
 * Word ou en PDF. Le retaper question par question est le vrai frein à
 * l'adoption — pas la mise en forme.
 *
 * Les règles sont volontairement simples et explicables, pour que le praticien
 * puisse corriger sa source plutôt que deviner ce que le logiciel a compris :
 *
 * - une ligne EN MAJUSCULES, ou préfixée de `#`, ouvre une section ;
 * - une ligne terminée par `?` devient une question Oui / Non ;
 * - une ligne terminée par `:` devient une question à réponse libre ;
 * - une ligne commençant par `-`, `*` ou `•` est une réponse proposée, et
 *   transforme la question qui précède en choix unique ;
 * - une ligne longue sans ponctuation finale devient un texte d'information.
 *
 * Le résultat est un brouillon ouvert dans l'éditeur, jamais une publication :
 * l'analyse se trompe forcément quelque part, et c'est le praticien qui tranche.
 */

const BULLET = /^[-*•·—]\s+/;
const NUMBERING = /^\(?\d+[.)°]?\s+|^[a-z][.)]\s+/i;
const HEADING_PREFIX = /^#+\s*/;

/** Une ligne « MAJUSCULES » reste un titre même avec accents et ponctuation. */
function looksLikeHeading(line: string): boolean {
  if (HEADING_PREFIX.test(line)) return true;
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  if (line.length > 70) return false;
  return letters === letters.toUpperCase() && /[A-ZÀ-Þ]/.test(letters);
}

function cleanLabel(line: string): string {
  return line.replace(HEADING_PREFIX, "").replace(NUMBERING, "").trim();
}

function titleCase(input: string): string {
  const lower = input.toLocaleLowerCase("fr");
  return lower.charAt(0).toLocaleUpperCase("fr") + lower.slice(1);
}

type PendingField = { field: FormFieldDraft; options: string[] };

/**
 * Analyse un texte collé et en tire un brouillon de formulaire.
 *
 * @param raw   Le texte du questionnaire existant.
 * @param title Titre du modèle ; à défaut, la première ligne fait l'affaire.
 */
export function draftFromText(raw: string, title?: string): TemplateDraft {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const taken = new Set<string>();
  const sections: SectionDraft[] = [];

  // Objet porteur plutôt que `let` : la question en cours est modifiée depuis
  // des fonctions imbriquées, que l'analyse de flux de TypeScript ne suit pas.
  const state: { pending: PendingField | null } = { pending: null };

  const flush = () => {
    if (!state.pending) return;
    const { field, options } = state.pending;

    if (options.length > 0) {
      field.type = "select";
      field.options = options.map((label) => ({
        value: fieldId(label, new Set()),
        label,
      }));
    }

    // Sans section ouverte, on en crée une neutre : mieux vaut un intitulé
    // générique qu'une question orpheline que l'éditeur refuserait.
    if (sections.length === 0) {
      sections.push({ id: "section_1", title: "Questions", fields: [] });
    }
    sections[sections.length - 1]!.fields.push(field);
    state.pending = null;
  };

  const openSection = (label: string) => {
    flush();
    sections.push({
      id: `section_${sections.length + 1}`,
      title: titleCase(label) || `Section ${sections.length + 1}`,
      fields: [],
    });
  };

  const openField = (label: string, type: FieldType) => {
    flush();
    state.pending = {
      field: { id: fieldId(label, taken), type, label },
      options: [],
    };
    taken.add(state.pending.field.id);
  };

  for (const line of lines) {
    if (BULLET.test(line)) {
      const option = line.replace(BULLET, "").trim();
      // Une puce sans question au-dessus n'est pas une réponse : c'est un
      // élément d'énumération, qu'on garde comme information.
      if (state.pending) state.pending.options.push(option);
      else openField(option, "text");
      continue;
    }

    const label = cleanLabel(line);
    if (label === "") continue;

    if (looksLikeHeading(line)) {
      openSection(label);
      continue;
    }

    if (label.endsWith("?")) {
      openField(label, "boolean");
      continue;
    }

    if (label.endsWith(":")) {
      openField(label.replace(/\s*:$/, ""), "text");
      continue;
    }

    // Une phrase longue sans question posée est une explication, pas une
    // question : la transformer en champ obligerait le patient à y répondre.
    if (label.length > 120) {
      flush();
      if (sections.length === 0) {
        sections.push({ id: "section_1", title: "Questions", fields: [] });
      }
      const id = fieldId(label.slice(0, 40), taken);
      taken.add(id);
      sections[sections.length - 1]!.fields.push({
        id,
        type: "info",
        label: "Information",
        body: label,
      });
      continue;
    }

    openField(label, "text");
  }

  flush();

  if (sections.length === 0) {
    sections.push({ id: "section_1", title: "Questions", fields: [] });
  }

  return {
    title: title?.trim() || cleanLabel(lines[0] ?? "") || "Questionnaire importé",
    intro: "",
    reflectionPeriodDays: 0,
    sections,
    statements: [
      {
        id: "sincerite",
        text: "Je certifie que les informations communiquées sont exactes et complètes.",
        required: true,
      },
    ],
  };
}

/** Compte rendu de l'analyse, affiché avant d'ouvrir l'éditeur. */
export function summarizeDraft(draft: TemplateDraft): {
  sections: number;
  questions: number;
  choices: number;
  infos: number;
} {
  const fields = draft.sections.flatMap((section) => section.fields);
  return {
    sections: draft.sections.length,
    questions: fields.filter((field) => field.type !== "info").length,
    choices: fields.filter((field) => field.type === "select").length,
    infos: fields.filter((field) => field.type === "info").length,
  };
}
