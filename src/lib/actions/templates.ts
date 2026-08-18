"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import {
  formDefinitionSchema,
  validateDefinitionIntegrity,
  type FormDefinition,
} from "@/lib/form-schema";
import { library } from "@/lib/library";
import {
  createTemplate,
  getTemplate,
  getTemplateByKey,
  publishVersion,
  type TemplateKind,
} from "@/lib/repos/forms";
import { checkDescriptivePhrasing } from "@/lib/vigilance";

/**
 * Édition des modèles de formulaire.
 *
 * Une version publiée ne bouge plus : enregistrer crée la version suivante.
 * Les documents déjà envoyés restent attachés à celle qu'ils ont affichée,
 * c'est ce qui permet de répondre deux ans plus tard à « quel texte exact le
 * patient a-t-il signé ce jour-là ».
 *
 * Conséquence assumée : il n'y a pas de brouillon. Chaque enregistrement est
 * une publication. Un brouillon supposerait de distinguer « en cours de
 * rédaction » et « opposable », ce qui ne vaut la peine que le jour où
 * plusieurs personnes éditent le même modèle.
 */

export type TemplateEditorState =
  | { status: "idle" }
  | { status: "error"; message: string; issues?: string[] }
  | { status: "saved"; templateId: string; version: number; warnings: string[] };

/** Slug stable à partir du titre, pour l'identifiant technique du modèle. */
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueKey(
  tx: Parameters<typeof getTemplateByKey>[0],
  base: string,
): Promise<string> {
  const root = base || "modele";
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? root : `${root}-${suffix + 1}`;
    if (!(await getTemplateByKey(tx, candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * Enregistre une définition éditée : nouveau modèle, ou nouvelle version.
 *
 * La définition arrive du navigateur : elle est revalidée intégralement ici.
 * Un client modifié ne doit pas pouvoir écrire une structure que le moteur de
 * rendu ne saurait pas afficher, ni une condition qui pointe dans le vide.
 */
export async function saveTemplate(
  _previous: TemplateEditorState,
  formData: FormData,
): Promise<TemplateEditorState> {
  const session = await requireSession();
  const client = await requestContext();

  const templateId = String(formData.get("templateId") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "questionnaire") as TemplateKind;
  const raw = String(formData.get("definition") ?? "");

  let parsed: FormDefinition;
  try {
    parsed = formDefinitionSchema.parse(JSON.parse(raw));
  } catch (error) {
    return {
      status: "error",
      message: "La structure du formulaire est invalide.",
      issues: [error instanceof Error ? error.message : String(error)].slice(0, 1),
    };
  }

  // Une condition qui vise un champ inexistant est toujours fausse : elle
  // masquerait silencieusement une question, y compris une question de
  // sécurité comme les allergies.
  const structural = validateDefinitionIntegrity(parsed);
  if (structural.length > 0) {
    return {
      status: "error",
      message: "Le formulaire comporte des incohérences.",
      issues: structural,
    };
  }

  // Non bloquant : on publie, mais on remonte les formulations qui glissent
  // vers la recommandation clinique (cf. MDR 2017/745).
  const warnings = checkDescriptivePhrasing(parsed).map(
    (warning) => `« ${warning.message} » — ${warning.reason}`,
  );

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        if (templateId) {
          const published = await publishVersion(tx, {
            tenantId: session.tenant.id,
            templateId,
            definition: parsed,
            createdBy: session.user.id,
          });
          await recordAudit(tx, session.tenant.id, {
            actorType: "user",
            actorId: session.user.id,
            actorLabel: session.user.fullName,
            action: "template.published",
            objectType: "form_template",
            objectId: templateId,
            ip: client.ip,
            userAgent: client.userAgent,
            metadata: { version: published.version, contentHash: published.contentHash },
          });
          return { templateId, version: published.version };
        }

        const key = await uniqueKey(tx, slugify(parsed.title));
        const created = await createTemplate(tx, {
          tenantId: session.tenant.id,
          key,
          title: parsed.title,
          description: parsed.intro ?? null,
          kind,
          specialty: null,
          definition: parsed,
          createdBy: session.user.id,
        });
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "template.created",
          objectType: "form_template",
          objectId: created.templateId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { key, kind },
        });
        return { templateId: created.templateId, version: 1 };
      },
    );

    return { status: "saved", ...result, warnings };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'enregistrement a échoué.",
    };
  }
}

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "imported"; templateId: string };

/**
 * Installe un modèle de la bibliothèque Ryla dans le cabinet.
 *
 * La copie appartient au cabinet et s'édite librement, mais garde son
 * `libraryRef` : c'est ce qui permettra plus tard de signaler qu'une version
 * révisée du texte source est disponible — un consentement dont la rédaction a
 * suivi une évolution de jurisprudence, par exemple.
 */
export async function importFromLibrary(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireSession();
  const client = await requestContext();
  const ref = String(formData.get("libraryRef") ?? "").trim();

  const entry = library.find((candidate) => candidate.libraryRef === ref);
  if (!entry) return { status: "error", message: "Modèle introuvable dans la bibliothèque." };

  let definition: FormDefinition;
  try {
    definition = formDefinitionSchema.parse(entry.definition);
  } catch {
    return { status: "error", message: "Ce modèle de la bibliothèque est illisible." };
  }

  try {
    const templateId = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const key = await uniqueKey(tx, slugify(definition.title));
        const created = await createTemplate(tx, {
          tenantId: session.tenant.id,
          key,
          title: definition.title,
          description: definition.intro ?? null,
          kind: entry.kind,
          specialty: entry.specialty,
          libraryRef: entry.libraryRef,
          definition,
          createdBy: session.user.id,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "template.imported",
          objectType: "form_template",
          objectId: created.templateId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { libraryRef: entry.libraryRef },
        });

        return created.templateId;
      },
    );

    return { status: "imported", templateId };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'import a échoué.",
    };
  }
}

export type DuplicateState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "duplicated"; templateId: string };

/**
 * Duplique un modèle pour pouvoir l'adapter.
 *
 * C'est le chemin normal pour partir d'un modèle de la bibliothèque : on ne
 * modifie pas l'original, on s'en fait une copie qui appartient au cabinet.
 */
export async function duplicateTemplate(
  _previous: DuplicateState,
  formData: FormData,
): Promise<DuplicateState> {
  const session = await requireSession();
  const client = await requestContext();
  const sourceId = String(formData.get("templateId") ?? "").trim();

  if (!sourceId) return { status: "error", message: "Modèle introuvable." };

  try {
    const templateId = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const source = await getTemplate(tx, sourceId);
        if (!source) throw new Error("Modèle introuvable.");

        const definition: FormDefinition = {
          ...source.definition,
          title: `${source.definition.title} (copie)`,
        };
        const key = await uniqueKey(tx, slugify(definition.title));

        const created = await createTemplate(tx, {
          tenantId: session.tenant.id,
          key,
          title: definition.title,
          description: definition.intro ?? null,
          kind: source.kind,
          specialty: source.specialty,
          // Pas de libraryRef sur la copie : elle appartient désormais au
          // cabinet et n'a plus à être présentée comme un modèle Ryla.
          definition,
          createdBy: session.user.id,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "template.duplicated",
          objectType: "form_template",
          objectId: created.templateId,
          ip: client.ip,
          userAgent: client.userAgent,
          metadata: { from: sourceId },
        });

        return created.templateId;
      },
    );

    return { status: "duplicated", templateId };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "La duplication a échoué.",
    };
  }
}

export type ArchiveState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "archived" };

/**
 * Archive un modèle : il disparaît de la liste d'envoi, sans être supprimé.
 *
 * Les documents déjà envoyés continuent de pointer vers leur version — on ne
 * détruit jamais ce qui sert de preuve.
 */
export async function archiveTemplate(
  _previous: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  const session = await requireSession();
  const client = await requestContext();
  const templateId = String(formData.get("templateId") ?? "").trim();

  if (!templateId) return { status: "error", message: "Modèle introuvable." };

  try {
    await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        await tx`
          update form_templates set archived_at = now()
          where id = ${templateId} and archived_at is null
        `;
        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "template.archived",
          objectType: "form_template",
          objectId: templateId,
          ip: client.ip,
          userAgent: client.userAgent,
        });
      },
    );
    return { status: "archived" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'archivage a échoué.",
    };
  }
}
