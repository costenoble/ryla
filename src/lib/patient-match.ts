/**
 * Rapprochement d'un patient à l'envoi d'un document.
 *
 * Isolé du code d'accès aux données pour être testable seul : c'est la logique
 * qui décide si les réponses d'une personne rejoignent le dossier d'une autre.
 *
 * Le défaut d'origine acceptait n'importe quel homonyme quand la date de
 * naissance n'était pas saisie : deux « Jean Martin » différents finissaient
 * dans le même dossier. Sur des données de santé, ça ne se rattrape pas.
 */

export type Candidate = { id: string; birthDate: string | null };

export type MatchOutcome =
  | { kind: "matched"; patientId: string }
  | { kind: "create" }
  /** Plusieurs homonymes et aucune date : on demande plutôt que de choisir. */
  | { kind: "ambiguous"; count: number };

export function matchPatient(
  candidates: Candidate[],
  birthDate: string | null,
): MatchOutcome {
  if (birthDate) {
    const exact = candidates.find((candidate) => candidate.birthDate === birthDate);
    // Pas de repli sur le nom seul : une date qui ne correspond à aucun dossier
    // désigne quelqu'un d'autre, pas une faute de frappe à rattraper.
    return exact ? { kind: "matched", patientId: exact.id } : { kind: "create" };
  }

  if (candidates.length === 1) return { kind: "matched", patientId: candidates[0]!.id };
  if (candidates.length > 1) return { kind: "ambiguous", count: candidates.length };
  return { kind: "create" };
}
