import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Chargement de .env pour les scripts hors Next.js (migrations, seed).
 *
 * Next.js s'en charge tout seul pour l'application ; les scripts CLI, non.
 * Quinze lignes valent mieux qu'une dépendance de plus dans un projet qui
 * manipule des données de santé — chaque paquet transitif est une surface
 * d'attaque supplémentaire.
 */
export function loadEnv(file = ".env"): void {
  let content: string;
  try {
    content = readFileSync(resolve(process.cwd(), file), "utf8");
  } catch {
    return; // Pas de .env : on s'en remet aux variables déjà présentes.
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Une variable déjà définie dans l'environnement l'emporte sur le fichier.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
