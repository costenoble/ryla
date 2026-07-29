/**
 * Contournement d'un bug du builder Next.js de Vercel.
 *
 * Symptôme : le build Next réussit, puis la plateforme échoue sur
 *   ENOENT: no such file or directory, lstat '.next/export-detail.json'
 *
 * Ce fichier n'est produit par Next que pour un export statique
 * (`output: 'export'`). Une application rendue côté serveur ne le génère
 * jamais — à juste titre. Le builder fait pourtant un `lstat` dessus sans
 * garde, alors que sa propre fonction de détection d'export
 * (`getExportStatus`) gère très bien son absence.
 *
 * On écrit donc un fichier minimal avec `version: 0`. Le `lstat` est
 * satisfait, et la détection d'export continue de répondre « non » : elle ne
 * traite que `version: 1`, tout le reste retombe sur la branche par défaut.
 * Écrire `version: 1` ferait au contraire passer l'application pour un export
 * statique — les pages dynamiques et les routes d'API disparaîtraient.
 *
 * À supprimer dès que le builder corrige ce point. Vérification : retirer ce
 * script du `build` et relancer un déploiement.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".next");
const file = join(dir, "export-detail.json");

if (!existsSync(dir)) {
  console.error("patch-vercel-build : .next absent, build Next non exécuté ?");
  process.exit(0);
}

if (existsSync(file)) {
  // Build en mode export : c'est Next qui a écrit le fichier, on n'y touche pas.
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
writeFileSync(file, JSON.stringify({ version: 0 }) + "\n", "utf8");
console.log("patch-vercel-build : .next/export-detail.json créé (contournement)");
