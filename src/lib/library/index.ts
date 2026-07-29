import type { FormDefinitionInput } from "../form-schema";
import { dentaireLibrary } from "./dentaire";
import { esthetiqueLibrary } from "./esthetique";

export * from "./dentaire";
export * from "./esthetique";

export type LibraryEntry = {
  key: string;
  kind: "questionnaire" | "consentement" | "devis" | "droit_image";
  specialty: "dentaire" | "esthetique" | "commun";
  libraryRef: string;
  definition: FormDefinitionInput;
};

/**
 * Bibliothèque de modèles validés.
 *
 * Le questionnaire numérique est une commodité — Doctolib le distribue
 * gratuitement depuis fin 2025. Ce qui ne se copie pas en une semaine, c'est
 * un corpus de documents rédigés pour tenir devant un juge. C'est là que se
 * situe la valeur, et c'est pour ça que ces définitions vivent dans le code,
 * versionnées et relues, plutôt que dans une base éditable à la volée.
 */
export const library: LibraryEntry[] = [...dentaireLibrary, ...esthetiqueLibrary];

export function librarySelection(
  specialty: "dentaire" | "esthetique" | "mixte",
): LibraryEntry[] {
  if (specialty === "mixte") return library;
  return library.filter(
    (entry) => entry.specialty === specialty || entry.specialty === "commun",
  );
}
