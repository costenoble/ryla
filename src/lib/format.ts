import type { AnswerValue, FormField } from "./form-schema";

/**
 * Formatage des réponses pour affichage.
 *
 * Partagé entre l'écran praticien et le PDF : les deux doivent restituer
 * exactement la même chose. Un « Oui » à l'écran et un « true » dans le
 * document signé, c'est une incohérence qu'on ne veut pas avoir à expliquer.
 */

type FormattableField = Pick<FormField, "type"> & {
  options?: { value: string; label: string }[];
};

export function formatAnswer(field: FormattableField, value: AnswerValue | undefined): string {
  if (value === null || value === undefined || value === "") return "Sans réponse";
  if (typeof value === "boolean") return value ? "Oui" : "Non";

  if (Array.isArray(value)) {
    if (value.length === 0) return "Aucun";
    return value
      .map((item) => field.options?.find((option) => option.value === item)?.label ?? item)
      .join(", ");
  }

  if (field.options) {
    const match = field.options.find((option) => option.value === String(value));
    if (match) return match.label;
  }

  if (field.type === "date") {
    const [year, month, day] = String(value).split("-");
    if (day && month && year) return `${day}/${month}/${year}`;
  }

  return String(value);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1 s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

/**
 * Horodatage à la seconde, pour le dossier de preuve.
 *
 * L'écran peut se contenter de la minute ; une pièce produite en justice, non :
 * l'écart entre l'affichage d'un consentement et sa signature se compte
 * justement en secondes.
 */
export function formatTimestamp(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

/** Empreinte tronquée, lisible dans une interface sans perdre son utilité. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}
