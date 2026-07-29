/**
 * Test de bout en bout du parcours patient.
 *
 * Crée un dossier, l'ouvre par son lien magique, enregistre des réponses puis
 * signe — en passant par le vrai serveur HTTP. Vérifie ensuite que le PDF
 * existe, que son empreinte correspond à celle enregistrée, et que le dossier
 * de preuve est cohérent.
 *
 *   npx tsx scripts/smoke.ts [http://localhost:3000]
 */
import { loadEnv } from "./load-env";

loadEnv();

import { verifyAuditChain } from "../src/lib/audit";
import { sha256Hex } from "../src/lib/crypto";
import { db, withPrivileged, withTenant } from "../src/lib/db";
import { issueAccessToken } from "../src/lib/magic-link";
import { verifyProofBundle, type ProofBundle } from "../src/lib/proof";
import { getTemplateByKey } from "../src/lib/repos/forms";
import { createSubmission, markSent } from "../src/lib/repos/submissions";
import { documentStore } from "../src/lib/storage";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const SLUG = "cabinet-martin";

const ok = (label: string) => console.log(`  ✓ ${label}`);
const fail = (label: string, detail?: unknown) => {
  console.error(`  ✗ ${label}`);
  if (detail) console.error("   ", detail);
  process.exitCode = 1;
};

try {
  // --- Préparation ---------------------------------------------------------
  const [tenant] = await withPrivileged(
    (sql) => sql<{ id: string }[]>`select id from app.resolve_tenant_by_slug(${SLUG})`,
  );
  if (!tenant) throw new Error(`Cabinet ${SLUG} absent. Lancez npm run db:seed.`);
  const tenantId = tenant.id;

  const setup = await withTenant({ tenantId }, async (tx) => {
    const template = await getTemplateByKey(tx, "anamnese-dentaire");
    if (!template?.currentVersionId) throw new Error("Modèle absent.");

    const [patient] = await tx<{ id: string }[]>`select id from patients limit 1`;

    const submissionId = await createSubmission(tx, {
      tenantId,
      templateId: template.id,
      formVersionId: template.currentVersionId,
      patientId: patient?.id ?? null,
    });
    await markSent(tx, submissionId);

    const token = await issueAccessToken(tx, {
      tenantId,
      tenantSlug: SLUG,
      submissionId,
    });

    return { submissionId, rawToken: token.rawToken };
  });

  console.log(`\nDossier ${setup.submissionId}\n`);

  // --- Ouverture du portail ------------------------------------------------
  const portal = await fetch(`${baseUrl}/p/${setup.rawToken}`);
  const html = await portal.text();
  portal.ok && html.includes("Questionnaire médical")
    ? ok("le portail s'ouvre avec le bon formulaire")
    : fail(`ouverture du portail (HTTP ${portal.status})`);

  // --- Enregistrement intermédiaire ---------------------------------------
  const partial = {
    nom: "Bertrand",
    prenom: "Julien",
    date_naissance: "1979-03-14",
    sexe: "m",
    traitement_en_cours: true,
    liste_medicaments: "Kardégic 75 mg",
  };

  const saved = await fetch(`${baseUrl}/api/p/${setup.rawToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save", answers: partial }),
  });
  saved.ok ? ok("enregistrement intermédiaire accepté") : fail("enregistrement intermédiaire");

  // --- Signature refusée si des obligations manquent -----------------------
  const incomplete = await fetch(`${baseUrl}/api/p/${setup.rawToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "submit",
      answers: partial,
      signerName: "Julien Bertrand",
      statements: [],
      dwell: [],
    }),
  });
  incomplete.status === 422
    ? ok("signature refusée tant que des réponses obligatoires manquent")
    : fail(`la signature aurait dû être refusée (HTTP ${incomplete.status})`);

  // --- Signature complète --------------------------------------------------
  const answers = {
    ...partial,
    anticoagulant: true,
    anticoagulant_nom: "Kardégic",
    biphosphonates: false,
    a_des_allergies: true,
    allergies_types: ["penicilline"],
    allergies_details: "Œdème de Quincke en 2011",
    pathologies: ["diabete"],
    diabete_equilibre: "oui",
    pacemaker: false,
    tabac: true,
    tabac_quantite: 10,
    anesthesie_probleme: false,
    motif: "Douleur molaire inférieure droite depuis dix jours",
    // Réponse à une question masquée (sexe = m) : elle doit être écartée.
    grossesse: true,
  };

  const signed = await fetch(`${baseUrl}/api/p/${setup.rawToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "submit",
      answers,
      signerName: "Julien Bertrand",
      statements: [
        { id: "sincerite", acceptedAt: new Date().toISOString() },
        { id: "information", acceptedAt: new Date().toISOString() },
      ],
      dwell: [
        { sectionId: "identite", ms: 21_000 },
        { sectionId: "traitements", ms: 48_000 },
        { sectionId: "allergies", ms: 33_000 },
      ],
      locale: "fr",
      timezoneOffsetMinutes: -120,
    }),
  });

  const signedBody = (await signed.json()) as { signed?: boolean; documentHash?: string };
  signed.ok && signedBody.signed
    ? ok("document signé")
    : fail(`signature (HTTP ${signed.status})`, signedBody);

  // --- Lien neutralisé après signature -------------------------------------
  const replay = await fetch(`${baseUrl}/api/p/${setup.rawToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save", answers }),
  });
  replay.status === 404 || replay.status === 409
    ? ok("le lien ne permet plus de modifier le dossier signé")
    : fail(`le lien aurait dû être neutralisé (HTTP ${replay.status})`);

  // --- Vérifications en base ----------------------------------------------
  await withTenant({ tenantId }, async (tx) => {
    const [submission] = await tx<
      { status: string; vigilance_count: number; vigilance_max_level: string | null }[]
    >`
      select status, vigilance_count, vigilance_max_level
      from submissions where id = ${setup.submissionId}
    `;

    submission?.status === "signed" ? ok("statut « signé »") : fail("statut du dossier");
    (submission?.vigilance_count ?? 0) >= 3 && submission?.vigilance_max_level === "critical"
      ? ok(`${submission.vigilance_count} alertes, niveau maximal « critical »`)
      : fail("compteur de vigilance", submission);

    const [signature] = await tx<{ document_hash: string; proof: ProofBundle }[]>`
      select document_hash, proof from signatures where submission_id = ${setup.submissionId}
    `;
    if (!signature) return fail("signature absente en base");

    verifyProofBundle(signature.proof)
      ? ok("le dossier de preuve est scellé et cohérent")
      : fail("empreinte du dossier de preuve");

    const readingTotal = signature.proof.reading.totalMs;
    readingTotal === 102_000
      ? ok("parcours de lecture consolidé (102 s)")
      : fail(`parcours de lecture : ${readingTotal} ms`);

    const [document] = await tx<{ storage_key: string; sha256: string }[]>`
      select storage_key, sha256 from documents where submission_id = ${setup.submissionId}
    `;
    if (!document) return fail("document absent en base");

    const bytes = await documentStore(tx, tenantId).get(document.storage_key);
    sha256Hex(bytes) === document.sha256 && bytes.subarray(0, 4).toString() === "%PDF"
      ? ok(`PDF généré et intègre (${Math.round(bytes.byteLength / 1024)} Ko)`)
      : fail("intégrité du PDF");

    // Le champ grossesse était masqué (sexe = m) : il ne doit pas avoir été
    // conservé, sinon une donnée jamais affichée figurerait au dossier signé.
    const answersText = JSON.stringify(signature.proof);
    !answersText.includes("grossesse")
      ? ok("les réponses masquées ont bien été écartées")
      : fail("une réponse masquée a été conservée");

    const chain = await verifyAuditChain(tx, tenantId);
    chain.valid
      ? ok(`chaîne d'audit intègre (${chain.entries} entrées)`)
      : fail("chaîne d'audit", chain);
  });

  console.log(
    process.exitCode ? "\nÉchecs détectés.\n" : "\nParcours patient validé de bout en bout.\n",
  );
} catch (error) {
  console.error("\nErreur :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db().end();
}
