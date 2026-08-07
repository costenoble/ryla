/**
 * Contournement d'un bug du builder Next.js de Vercel.
 *
 * Symptôme original : le build Next réussit, puis la plateforme échoue sur
 *   ENOENT: no such file or directory, lstat '.next/export-detail.json'
 *
 * Ce fichier n'est produit par Next que pour un export statique
 * (`output: 'export'`). Une application rendue côté serveur ne le génère
 * jamais — à juste titre. Le builder fait pourtant un `lstat` dessus sans
 * garde, alors que sa propre fonction de détection d'export
 * (`getExportStatus`) gère très bien son absence.
 *
 * Deux passes, pas une seule :
 *
 *   --pre  (avant `next build`) supprime tout `export-detail.json` hérité du
 *          cache de build Vercel. Le cache conserve `.next` d'un déploiement à
 *          l'autre ; sans ce nettoyage, un fichier écrit par --post lors d'un
 *          déploiement précédent survit au build suivant. Le builder le
 *          retrouve alors AVANT que --post n'ait rejoué, dans un état
 *          incohérent avec la sortie fraîche de `next build`, et échoue
 *          ailleurs dans sa logique d'export (lstat sur
 *          `.next/export/404.html`, qui lui n'existe jamais pour une
 *          application côté serveur).
 *
 *   --post (après `next build`) réécrit le fichier avec `version: 0` : le
 *          lstat du builder est satisfait, et sa détection d'export continue
 *          de répondre « non » — elle ne traite que la version 1. Écrire 1
 *          ferait passer l'application pour un export statique et
 *          supprimerait les routes dynamiques et les API.
 *
 * À supprimer dès que le builder corrige ce point.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv.includes("--pre") ? "pre" : "post";
const dir = join(process.cwd(), ".next");
const file = join(dir, "export-detail.json");
const exportDir = join(dir, "export");

if (mode === "pre") {
  if (existsSync(file)) {
    rmSync(file, { force: true });
    console.log("patch-vercel-build (pre) : export-detail.json hérité du cache supprimé");
  }
  // Un répertoire `export/` hérité poserait le même problème pour tout code
  // qui en dépendrait sans vérifier `success` en amont.
  if (existsSync(exportDir)) {
    rmSync(exportDir, { recursive: true, force: true });
    console.log("patch-vercel-build (pre) : .next/export hérité du cache supprimé");
  }
  process.exit(0);
}

// --post
if (!existsSync(dir)) {
  console.error("patch-vercel-build (post) : .next absent, build Next non exécuté ?");
  process.exit(0);
}

if (existsSync(file)) {
  // Build en mode export : c'est Next qui a écrit le fichier, on n'y touche pas.
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
writeFileSync(file, JSON.stringify({ version: 0 }) + "\n", "utf8");
console.log("patch-vercel-build (post) : export-detail.json créé (contournement)");
