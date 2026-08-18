"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { IconAlert, IconCheck, IconChevronRight, IconFile } from "@/components/icons";
import { Badge, Button, Card, CardHeader, cx, inputClass } from "@/components/ui";
import { saveTemplate, type TemplateEditorState } from "@/lib/actions/templates";
import { FieldEditor } from "./FieldEditor";
import {
  dropDanglingConditions,
  emptyDraft,
  fieldId,
  toDefinition,
  type FormFieldDraft,
  type SectionDraft,
  type TemplateDraft,
} from "./types";

const initial: TemplateEditorState = { status: "idle" };

/**
 * Questions qu'une condition peut viser depuis une position donnée.
 *
 * Uniquement celles posées *avant* : une condition qui dépend d'une réponse que
 * le patient n'a pas encore donnée serait toujours fausse au premier rendu, et
 * masquerait donc une question — y compris une question de sécurité.
 *
 * Restreint aux Oui / Non, comme l'éditeur de condition lui-même.
 */
function referenceableBefore(
  draft: TemplateDraft,
  sectionIndex: number,
  fieldIndex: number,
): { id: string; label: string; type: string }[] {
  const result: { id: string; label: string; type: string }[] = [];

  for (let si = 0; si <= sectionIndex; si += 1) {
    const fields = draft.sections[si]?.fields ?? [];
    const limit = si === sectionIndex ? fieldIndex : fields.length;
    for (let fi = 0; fi < limit; fi += 1) {
      const field = fields[fi]!;
      if (field.type === "boolean" && field.label.trim() !== "") {
        result.push({ id: field.id, label: field.label, type: field.type });
      }
    }
  }

  return result;
}

/**
 * Éditeur de modèle.
 *
 * Tout se manipule dans un seul état JSON, converti au format publié au moment
 * d'enregistrer. Le serveur revalide intégralement : ce qui sort d'ici n'est
 * jamais cru sur parole.
 *
 * Il n'y a pas de brouillon — chaque enregistrement publie une nouvelle
 * version, et les documents déjà envoyés restent sur la leur. C'est ce qui
 * permet de prouver, deux ans après, quel texte exact a été signé.
 */
export function TemplateEditor({
  templateId,
  kind,
  initialDraft,
  currentVersion,
}: {
  templateId?: string;
  kind: string;
  initialDraft?: TemplateDraft;
  currentVersion?: number | null;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(initialDraft ?? emptyDraft());
  const [state, formAction, pending] = useActionState(saveTemplate, initial);
  const [showPreview, setShowPreview] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "saved") return;

    if (!templateId) {
      router.push(`/modeles/${state.templateId}`);
      return;
    }

    // Rafraîchit l'historique et le numéro de version affichés par le serveur.
    //
    // `router.refresh()` et non `revalidatePath()` dans l'action : la
    // revalidation régénère la page en arrière-plan, hors du contexte de
    // cookies de la requête, ce qui fait échouer le `requireSession()` du
    // layout (cf. le commentaire dans `lib/actions/dossiers.ts`). Ici le
    // rafraîchissement part du navigateur, donc avec la session.
    router.refresh();
  }, [state, templateId, router]);

  const definition = useMemo(() => toDefinition(draft), [draft]);

  const takenIds = useMemo(
    () => new Set(draft.sections.flatMap((section) => section.fields.map((f) => f.id))),
    [draft],
  );

  const updateSection = (index: number, patch: Partial<SectionDraft>) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    }));

  const moveSection = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const sections = [...current.sections];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [sections[target]!, sections[index]!];
      return { ...current, sections };
    });

  const addField = (sectionIndex: number) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, i) =>
        i === sectionIndex
          ? {
              ...section,
              fields: [
                ...section.fields,
                {
                  id: fieldId(`question ${section.fields.length + 1}`, takenIds),
                  type: "boolean" as const,
                  label: "",
                  required: false,
                },
              ],
            }
          : section,
      ),
    }));

  /**
   * L'identifiant technique se fige à la première saisie de l'intitulé.
   *
   * Le renommer ensuite casserait les conditions et les alertes qui le
   * référencent, et surtout les réponses déjà enregistrées sous cette clé.
   */
  const updateField = (sectionIndex: number, fieldIndex: number, next: FormFieldDraft) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, i) => {
        if (i !== sectionIndex) return section;
        return {
          ...section,
          fields: section.fields.map((field, j) => {
            if (j !== fieldIndex) return field;
            const idIsPlaceholder = /^question(_\d+)?$/.test(field.id) || field.label === "";
            const id =
              idIsPlaceholder && next.label.trim() !== ""
                ? fieldId(next.label, new Set([...takenIds].filter((x) => x !== field.id)))
                : field.id;
            return { ...next, id };
          }),
        };
      }),
    }));

  const moveField = (sectionIndex: number, fieldIndex: number, direction: -1 | 1) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, i) => {
        if (i !== sectionIndex) return section;
        const fields = [...section.fields];
        const target = fieldIndex + direction;
        if (target < 0 || target >= fields.length) return section;
        [fields[fieldIndex], fields[target]] = [fields[target]!, fields[fieldIndex]!];
        return { ...section, fields };
      }),
    }));

  const removeField = (sectionIndex: number, fieldIndex: number) =>
    setDraft((current) => {
      const removed = current.sections[sectionIndex]?.fields[fieldIndex];
      const sections = current.sections.map((section, i) =>
        i === sectionIndex
          ? { ...section, fields: section.fields.filter((_, j) => j !== fieldIndex) }
          : section,
      );
      return { ...current, sections: dropDanglingConditions(sections, removed ? [removed.id] : []) };
    });

  const removeSection = (sectionIndex: number) =>
    setDraft((current) => {
      const removed = current.sections[sectionIndex]?.fields.map((f) => f.id) ?? [];
      const sections = current.sections.filter((_, i) => i !== sectionIndex);
      return { ...current, sections: dropDanglingConditions(sections, removed) };
    });

  const questionCount = draft.sections.reduce(
    (sum, section) => sum + section.fields.filter((f) => f.type !== "info").length,
    0,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        {/* --- Identité du formulaire ------------------------------------- */}
        <Card className="p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-body">
              Titre du formulaire <span className="text-flame-600">*</span>
            </span>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className={cx(inputClass, "text-base font-semibold")}
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-semibold text-body">
              Introduction
            </span>
            <textarea
              rows={2}
              value={draft.intro ?? ""}
              onChange={(event) => setDraft({ ...draft, intro: event.target.value })}
              placeholder="Ces informations sont indispensables à votre sécurité…"
              className={cx(inputClass, "text-sm")}
            />
          </label>
        </Card>

        {/* --- Sections ---------------------------------------------------- */}
        {draft.sections.map((section, sectionIndex) => {
          return (
            <Card key={section.id}>
              <div className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                  <input
                    value={section.title}
                    onChange={(event) =>
                      updateSection(sectionIndex, { title: event.target.value })
                    }
                    placeholder="Titre de la section"
                    className={cx(inputClass, "py-2 font-semibold")}
                  />
                  <input
                    value={section.description ?? ""}
                    onChange={(event) =>
                      updateSection(sectionIndex, { description: event.target.value })
                    }
                    placeholder="Description (facultatif)"
                    className={cx(inputClass, "mt-2 py-1.5 text-xs")}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Monter la section"
                    disabled={sectionIndex === 0}
                    onClick={() => moveSection(sectionIndex, -1)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition hover:bg-canvas hover:text-body disabled:cursor-not-allowed disabled:text-line-strong"
                  >
                    <IconChevronRight className="size-4 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    title="Descendre la section"
                    disabled={sectionIndex === draft.sections.length - 1}
                    onClick={() => moveSection(sectionIndex, 1)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition hover:bg-canvas hover:text-body disabled:cursor-not-allowed disabled:text-line-strong"
                  >
                    <IconChevronRight className="size-4 rotate-90" />
                  </button>
                  {draft.sections.length > 1 ? (
                    <button
                      type="button"
                      title="Supprimer la section"
                      onClick={() => removeSection(sectionIndex)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition hover:bg-danger-soft hover:text-danger"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 p-5">
                {section.fields.map((field, fieldIndex) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    earlierFields={referenceableBefore(draft, sectionIndex, fieldIndex)}
                    onChange={(next) => updateField(sectionIndex, fieldIndex, next)}
                    onRemove={() => removeField(sectionIndex, fieldIndex)}
                    onMove={(direction) => moveField(sectionIndex, fieldIndex, direction)}
                    canMoveUp={fieldIndex > 0}
                    canMoveDown={fieldIndex < section.fields.length - 1}
                  />
                ))}

                <Button type="button" variant="outline" onClick={() => addField(sectionIndex)}>
                  Ajouter une question
                </Button>
              </div>
            </Card>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setDraft({
              ...draft,
              sections: [
                ...draft.sections,
                {
                  id: `section_${draft.sections.length + 1}_${Date.now().toString(36)}`,
                  title: "Nouvelle section",
                  fields: [],
                },
              ],
            })
          }
        >
          Ajouter une section
        </Button>

        {/* --- Signature --------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Déclarations à signer"
            subtitle="Cochées une par une par le patient, avec l'heure exacte de chaque coche."
          />
          <div className="space-y-3 p-5">
            {draft.statements.map((statement, index) => (
              <div key={statement.id} className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={statement.text}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      statements: draft.statements.map((s, i) =>
                        i === index ? { ...s, text: event.target.value } : s,
                      ),
                    })
                  }
                  className={cx(inputClass, "py-2 text-sm")}
                />
                <button
                  type="button"
                  title="Retirer"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      statements: draft.statements.filter((_, i) => i !== index),
                    })
                  }
                  className="mt-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint transition hover:bg-danger-soft hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  statements: [
                    ...draft.statements,
                    { id: `decl_${Date.now().toString(36)}`, text: "", required: true },
                  ],
                })
              }
            >
              Ajouter une déclaration
            </Button>
          </div>
        </Card>
      </div>

      {/* --- Colonne d'action ---------------------------------------------- */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <p className="text-sm font-semibold text-body">
            {templateId ? "Publier une version" : "Créer le modèle"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {templateId
              ? `Version actuelle : ${currentVersion ?? "—"}. Enregistrer publie la suivante ; les documents déjà envoyés gardent la leur.`
              : "Le modèle sera immédiatement disponible à l'envoi."}
          </p>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
            <span>{draft.sections.length} section(s)</span>
            <span>·</span>
            <span>{questionCount} question(s)</span>
          </div>

          <form action={formAction} className="mt-4">
            {templateId ? (
              <input type="hidden" name="templateId" value={templateId} />
            ) : null}
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="definition" value={JSON.stringify(definition)} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Enregistrement…" : templateId ? "Publier" : "Créer"}
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            onClick={() => setShowPreview((value) => !value)}
          >
            {showPreview ? "Masquer l'aperçu" : "Aperçu patient"}
          </Button>

          {state.status === "error" ? (
            <div
              role="alert"
              className="mt-3 rounded-md bg-danger-soft px-3 py-2.5 text-xs text-danger"
            >
              <p className="flex items-start gap-1.5 font-semibold">
                <IconAlert className="mt-0.5 size-3.5 shrink-0" />
                {state.message}
              </p>
              {state.issues?.length ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {state.issues.slice(0, 5).map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {state.status === "saved" ? (
            <div className="mt-3 rounded-md bg-positive-soft px-3 py-2.5 text-xs text-positive">
              <p className="flex items-center gap-1.5 font-semibold">
                <IconCheck className="size-3.5" />
                Version {state.version} publiée
              </p>
              {state.warnings.length > 0 ? (
                <p className="mt-1.5 text-caution">
                  {state.warnings.length} formulation(s) de vigilance à revoir — voir
                  la page Modèles.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        {showPreview ? <Preview draft={draft} /> : null}
      </div>
    </div>
  );
}

/**
 * Aperçu simplifié.
 *
 * Ne rejoue pas la logique conditionnelle : il montre l'enchaînement et la
 * formulation, ce qui est la question qu'on se pose en écrivant. Pour vérifier
 * le comportement réel, il faut s'envoyer le formulaire.
 */
function Preview({ draft }: { draft: TemplateDraft }) {
  return (
    <Card>
      <CardHeader title="Aperçu" subtitle="Enchaînement et formulation" />
      <div className="max-h-[60vh] overflow-y-auto p-4 scroll-slim">
        <p className="text-sm font-bold text-body">{draft.title}</p>
        {draft.intro ? (
          <p className="mt-1 text-xs leading-relaxed text-muted">{draft.intro}</p>
        ) : null}

        {draft.sections.map((section) => (
          <div key={section.id} className="mt-4">
            <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">
              {section.title}
            </p>
            <ul className="mt-2 space-y-2">
              {section.fields.map((field) => (
                <li key={field.id} className="text-xs">
                  {field.type === "info" ? (
                    <span className="block rounded bg-canvas p-2 text-muted italic">
                      {field.body || "(texte d'information)"}
                    </span>
                  ) : (
                    <>
                      <span className="text-body">
                        {field.label || <span className="text-faint italic">(sans intitulé)</span>}
                        {field.required ? <span className="text-flame-600"> *</span> : null}
                      </span>
                      {field.visibleIf ? (
                        <span className="mt-0.5 block text-[11px] text-faint">
                          affiché si « {field.visibleIf.field} » vaut{" "}
                          {field.visibleIf.value ? "Oui" : "Non"}
                        </span>
                      ) : null}
                      {(field.vigilance ?? []).length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {field.vigilance!.map((rule, index) => (
                            <Badge
                              key={index}
                              tone={rule.level === "critical" ? "danger" : "caution"}
                            >
                              {rule.level === "critical" ? "Critique" : "À noter"}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
              {section.fields.length === 0 ? (
                <li className="text-xs text-faint italic">Aucune question</li>
              ) : null}
            </ul>
          </div>
        ))}

        {draft.statements.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-body">
              <IconFile className="size-3.5" />
              Signature
            </p>
            <ul className="mt-1.5 space-y-1">
              {draft.statements.map((statement) => (
                <li key={statement.id} className="text-[11px] text-muted">
                  ☐ {statement.text || "(déclaration vide)"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
