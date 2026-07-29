import { canonicalHash } from "../crypto";
import type { Tx } from "../db";
import {
  parseFormDefinition,
  validateDefinitionIntegrity,
  type FormDefinition,
} from "../form-schema";

/**
 * Modèles de formulaires et versions.
 *
 * Une version publiée ne bouge plus. Modifier un formulaire crée la version
 * suivante ; les dossiers déjà envoyés restent attachés à celle qu'ils ont
 * affichée. C'est ce qui permet de répondre, deux ans plus tard, à « quel
 * texte exact le patient a-t-il signé ce jour-là ? ».
 */

export type TemplateKind = "questionnaire" | "consentement" | "devis" | "droit_image";

export type TemplateSummary = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  kind: TemplateKind;
  specialty: "dentaire" | "esthetique" | "commun" | null;
  currentVersionId: string | null;
  currentVersion: number | null;
  libraryRef: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
};

export async function listTemplates(tx: Tx): Promise<TemplateSummary[]> {
  const rows = await tx<
    {
      id: string;
      key: string;
      title: string;
      description: string | null;
      kind: TemplateKind;
      specialty: TemplateSummary["specialty"];
      current_version_id: string | null;
      current_version: number | null;
      library_ref: string | null;
      archived_at: Date | null;
      updated_at: Date;
    }[]
  >`
    select t.id, t.key, t.title, t.description, t.kind, t.specialty,
           t.current_version_id, v.version as current_version, t.library_ref,
           t.archived_at, t.updated_at
    from form_templates t
    left join form_versions v on v.id = t.current_version_id
    where t.archived_at is null
    order by t.kind, t.title
  `;

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    kind: row.kind,
    specialty: row.specialty,
    currentVersionId: row.current_version_id,
    currentVersion: row.current_version,
    libraryRef: row.library_ref,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export type TemplateWithDefinition = TemplateSummary & {
  definition: FormDefinition;
  contentHash: string;
  publishedAt: Date | null;
};

export async function getTemplate(
  tx: Tx,
  templateId: string,
): Promise<TemplateWithDefinition | null> {
  const rows = await tx<
    {
      id: string;
      key: string;
      title: string;
      description: string | null;
      kind: TemplateKind;
      specialty: TemplateSummary["specialty"];
      current_version_id: string | null;
      current_version: number | null;
      library_ref: string | null;
      archived_at: Date | null;
      updated_at: Date;
      definition: unknown;
      content_hash: string;
      published_at: Date | null;
    }[]
  >`
    select t.id, t.key, t.title, t.description, t.kind, t.specialty,
           t.current_version_id, v.version as current_version, t.library_ref,
           t.archived_at, t.updated_at,
           v.definition, v.content_hash, v.published_at
    from form_templates t
    join form_versions v on v.id = t.current_version_id
    where t.id = ${templateId}
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    kind: row.kind,
    specialty: row.specialty,
    currentVersionId: row.current_version_id,
    currentVersion: row.current_version,
    libraryRef: row.library_ref,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    definition: parseFormDefinition(row.definition),
    contentHash: row.content_hash,
    publishedAt: row.published_at,
  };
}

export async function getTemplateByKey(
  tx: Tx,
  key: string,
): Promise<TemplateWithDefinition | null> {
  const [row] = await tx<{ id: string }[]>`
    select id from form_templates where key = ${key} and archived_at is null
  `;
  return row ? getTemplate(tx, row.id) : null;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function assertValid(definition: FormDefinition): void {
  const errors = validateDefinitionIntegrity(definition);
  if (errors.length > 0) {
    throw new Error(`Définition invalide :\n- ${errors.join("\n- ")}`);
  }
}

export async function createTemplate(
  tx: Tx,
  params: {
    tenantId: string;
    key: string;
    title: string;
    description?: string | null;
    kind: TemplateKind;
    specialty?: TemplateSummary["specialty"];
    libraryRef?: string | null;
    definition: FormDefinition;
    createdBy?: string | null;
  },
): Promise<{ templateId: string; versionId: string; contentHash: string }> {
  assertValid(params.definition);

  const [template] = await tx<{ id: string }[]>`
    insert into form_templates (
      tenant_id, key, title, description, kind, specialty, library_ref
    ) values (
      ${params.tenantId}, ${params.key}, ${params.title},
      ${params.description ?? null}, ${params.kind},
      ${params.specialty ?? null}, ${params.libraryRef ?? null}
    )
    returning id
  `;
  if (!template) throw new Error("Création du modèle impossible.");

  const published = await publishVersion(tx, {
    tenantId: params.tenantId,
    templateId: template.id,
    definition: params.definition,
    createdBy: params.createdBy,
  });

  return { templateId: template.id, ...published };
}

export async function publishVersion(
  tx: Tx,
  params: {
    tenantId: string;
    templateId: string;
    definition: FormDefinition;
    createdBy?: string | null;
  },
): Promise<{ versionId: string; contentHash: string; version: number }> {
  assertValid(params.definition);

  const [last] = await tx<{ version: number }[]>`
    select coalesce(max(version), 0) as version
    from form_versions where template_id = ${params.templateId}
  `;
  const version = (last?.version ?? 0) + 1;
  const contentHash = canonicalHash(params.definition);

  const [row] = await tx<{ id: string }[]>`
    insert into form_versions (
      tenant_id, template_id, version, definition, content_hash,
      published_at, created_by
    ) values (
      ${params.tenantId}, ${params.templateId}, ${version},
      ${tx.json(params.definition as never)}, ${contentHash}, now(),
      ${params.createdBy ?? null}
    )
    returning id
  `;
  if (!row) throw new Error("Publication de la version impossible.");

  await tx`
    update form_templates
    set current_version_id = ${row.id}, title = ${params.definition.title}
    where id = ${params.templateId}
  `;

  return { versionId: row.id, contentHash, version };
}
