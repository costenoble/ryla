import type { Tx } from "./db";
import { parseFormDefinition } from "./form-schema";
import { IMPORTED_QUOTE_KEY, importedQuoteDefinition } from "./imported-quote";
import { createTemplate, getTemplateByKey } from "./repos/forms";
import { createSubmission, markSent } from "./repos/submissions";
import { buildStorageKey, documentStore } from "./storage";

/**
 * Transforme un PDF de devis en dossier de signature.
 *
 * Chemin unique pour les deux origines — le devis composé dans Ryla et celui
 * importé de Logos ou VisioDent. C'est délibéré : ce qui donne sa valeur
 * probante à une signature, c'est le faisceau, et il ne doit pas dépendre de
 * l'endroit où le document a été fabriqué. Deux chemins auraient fini par
 * diverger, et le second aurait été le moins bien testé.
 *
 * Le PDF n'est jamais réécrit ensuite : il est scellé par son empreinte, et
 * reproduit page pour page en tête du document signé.
 */
export async function createQuoteSignature(
  tx: Tx,
  params: {
    tenantId: string;
    userId: string;
    patientId: string;
    kind: "dentaire" | "esthetique";
    filename: string;
    bytes: Uint8Array;
    sha256: string;
    origin: "generated" | "imported";
  },
): Promise<string> {
  const template = await ensureTemplate(tx, params.tenantId, params.kind, params.userId);

  const submissionId = await createSubmission(tx, {
    tenantId: params.tenantId,
    templateId: template.templateId,
    formVersionId: template.versionId,
    patientId: params.patientId,
    createdBy: params.userId,
    assignedTo: params.userId,
  });

  const storageKey = buildStorageKey({
    tenantId: params.tenantId,
    submissionId,
    kind: "devis",
    filename: params.filename,
  });
  const stored = await documentStore(tx, params.tenantId).put(storageKey, params.bytes);

  const [document] = await tx<{ id: string }[]>`
    insert into documents (
      tenant_id, submission_id, kind, filename, storage_key, sha256, byte_size, origin
    ) values (
      ${params.tenantId}, ${submissionId}, 'devis', ${params.filename},
      ${stored.key}, ${params.sha256}, ${stored.byteSize}, ${params.origin}
    )
    returning id
  `;
  if (!document) throw new Error("Enregistrement du devis impossible.");

  await tx`
    update submissions set source_document_id = ${document.id} where id = ${submissionId}
  `;
  await markSent(tx, submissionId);

  return submissionId;
}

/**
 * Modèle de signature du cabinet, créé à la volée.
 *
 * Une fois par cabinet et par régime, plutôt que livré par migration : un
 * cabinet qui ne fait jamais signer de devis n'a pas à voir ce modèle traîner
 * dans sa bibliothèque.
 */
async function ensureTemplate(
  tx: Tx,
  tenantId: string,
  kind: "dentaire" | "esthetique",
  createdBy: string,
): Promise<{ templateId: string; versionId: string }> {
  const key = `${IMPORTED_QUOTE_KEY}-${kind}`;
  const existing = await getTemplateByKey(tx, key);
  if (existing?.currentVersionId) {
    return { templateId: existing.id, versionId: existing.currentVersionId };
  }

  const definition = parseFormDefinition(importedQuoteDefinition(kind));
  const created = await createTemplate(tx, {
    tenantId,
    key,
    title: definition.title,
    description: "Signature d'un devis.",
    kind: "devis",
    specialty: kind === "esthetique" ? "esthetique" : "dentaire",
    definition,
    createdBy,
  });

  return { templateId: created.templateId, versionId: created.versionId };
}
