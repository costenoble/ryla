"use client";

import { IconAlert, IconChevronRight } from "@/components/icons";
import { Button, cx, inputClass, inputInlineClass } from "@/components/ui";
import type { FormFieldDraft, VigilanceDraft } from "./types";
import { FIELD_TYPES, needsOptions, supportsVigilance } from "./types";

/**
 * Édition d'un champ.
 *
 * Chaque type n'expose que ses propres réglages : un champ « Oui / Non » n'a
 * pas d'options à saisir, une échelle n'a pas de longueur maximale. Afficher
 * tous les réglages pour tous les types transformerait l'écran en formulaire
 * de configuration illisible.
 */

type Props = {
  field: FormFieldDraft;
  /** Champs situés avant celui-ci — seuls candidats à une condition. */
  earlierFields: { id: string; label: string; type: string }[];
  onChange: (next: FormFieldDraft) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export function FieldEditor({
  field,
  earlierFields,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: Props) {
  const set = (patch: Partial<FormFieldDraft>) => onChange({ ...field, ...patch });

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-body">
              Question <span className="text-flame-600">*</span>
            </span>
            <input
              value={field.label}
              onChange={(event) => set({ label: event.target.value })}
              placeholder="Prenez-vous un anticoagulant ?"
              className={cx(inputClass, "py-2 text-sm")}
            />
          </label>
        </div>

        <label className="w-44">
          <span className="mb-1 block text-xs font-semibold text-body">Type</span>
          <select
            value={field.type}
            onChange={(event) => set({ type: event.target.value as FormFieldDraft["type"] })}
            className={cx(inputClass, "py-2 text-sm")}
          >
            {FIELD_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1 pt-5">
          <IconButton label="Monter" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <IconChevronRight className="size-4 -rotate-90" />
          </IconButton>
          <IconButton label="Descendre" disabled={!canMoveDown} onClick={() => onMove(1)}>
            <IconChevronRight className="size-4 rotate-90" />
          </IconButton>
          <IconButton label="Supprimer la question" onClick={onRemove} danger>
            <span aria-hidden="true" className="text-sm">
              ✕
            </span>
          </IconButton>
        </div>
      </div>

      {/* --- Réglages propres au type ------------------------------------- */}
      {field.type === "info" ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-body">
            Texte affiché <span className="text-flame-600">*</span>
          </span>
          <textarea
            rows={4}
            value={field.body ?? ""}
            onChange={(event) => set({ body: event.target.value })}
            placeholder="Information, avertissement, description d'un acte…"
            className={cx(inputClass, "py-2 text-sm")}
          />
        </label>
      ) : null}

      {field.type === "consent" || field.type === "photo_consent" ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-body">
            Déclaration à cocher <span className="text-flame-600">*</span>
          </span>
          <textarea
            rows={3}
            value={field.statement ?? ""}
            onChange={(event) => set({ statement: event.target.value })}
            placeholder="Je certifie que les informations communiquées sont exactes…"
            className={cx(inputClass, "py-2 text-sm")}
          />
        </label>
      ) : null}

      {field.type === "photo_consent" ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-body">Usage concerné</span>
          <select
            value={field.scope ?? "dossier_medical"}
            onChange={(event) => set({ scope: event.target.value as FormFieldDraft["scope"] })}
            className={cx(inputClass, "py-2 text-sm")}
          >
            <option value="dossier_medical">Dossier médical</option>
            <option value="site_web">Site internet du cabinet</option>
            <option value="reseaux_sociaux">Réseaux sociaux</option>
            <option value="publication_scientifique">Publication scientifique</option>
            <option value="formation">Enseignement</option>
          </select>
          <span className="mt-1 block text-xs text-muted">
            Un consentement par usage : le patient peut accepter le dossier et refuser
            les réseaux sociaux.
          </span>
        </label>
      ) : null}

      {needsOptions(field.type) ? (
        <div className="mt-3">
          <span className="mb-1 block text-xs font-semibold text-body">
            Réponses proposées <span className="text-flame-600">*</span>
          </span>
          <textarea
            rows={4}
            value={(field.options ?? []).map((option) => option.label).join("\n")}
            onChange={(event) =>
              set({
                options: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((label) => ({ value: slugifyOption(label), label })),
              })
            }
            placeholder={"Une réponse par ligne\nPénicilline\nLatex\nAnesthésiques locaux"}
            className={cx(inputClass, "py-2 text-sm")}
          />
          <span className="mt-1 block text-xs text-muted">Une réponse par ligne.</span>
        </div>
      ) : null}

      {field.type === "number" || field.type === "scale" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <NumberInput
            label="Minimum"
            value={field.min}
            onChange={(value) => set({ min: value })}
          />
          <NumberInput
            label="Maximum"
            value={field.max}
            onChange={(value) => set({ max: value })}
          />
          {field.type === "number" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-body">Unité</span>
              <input
                value={field.unit ?? ""}
                onChange={(event) => set({ unit: event.target.value })}
                placeholder="kg, cm, cig./jour"
                className={cx(inputClass, "py-2 text-sm")}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-semibold text-body">
          Aide affichée sous la question
        </span>
        <input
          value={field.help ?? ""}
          onChange={(event) => set({ help: event.target.value })}
          placeholder="Facultatif"
          className={cx(inputClass, "py-2 text-sm")}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {field.type !== "info" ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(event) => set({ required: event.target.checked })}
              className="size-4 accent-[var(--color-brand-600)]"
            />
            Réponse obligatoire
          </label>
        ) : null}

        <ConditionEditor field={field} earlierFields={earlierFields} onChange={set} />
      </div>

      {supportsVigilance(field.type) ? (
        <VigilanceEditor field={field} onChange={set} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function slugifyOption(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || `option_${Math.random().toString(36).slice(2, 8)}`;
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex size-8 cursor-pointer items-center justify-center rounded-lg transition",
        disabled
          ? "cursor-not-allowed text-line-strong"
          : danger
            ? "text-faint hover:bg-danger-soft hover:text-danger"
            : "text-faint hover:bg-canvas hover:text-body",
      )}
    >
      {children}
    </button>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-body">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
        className={cx(inputClass, "py-2 text-sm")}
      />
    </label>
  );
}

/**
 * Condition d'affichage — volontairement limitée à une seule règle simple.
 *
 * Les conditions composées (« si A et B ») existent dans le format et sont
 * lues correctement au rendu ; les exposer à la saisie demanderait un
 * constructeur d'arbre booléen que personne n'utiliserait correctement. Le cas
 * réel est « n'afficher cette question que si la précédente vaut Oui ».
 */
function ConditionEditor({
  field,
  earlierFields,
  onChange,
}: {
  field: FormFieldDraft;
  earlierFields: Props["earlierFields"];
  onChange: (patch: Partial<FormFieldDraft>) => void;
}) {
  const condition = field.visibleIf;
  const source = earlierFields.find((entry) => entry.id === condition?.field);

  if (earlierFields.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={Boolean(condition)}
          onChange={(event) =>
            onChange({
              visibleIf: event.target.checked
                ? { field: earlierFields[0]!.id, op: "eq", value: true }
                : undefined,
            })
          }
          className="size-4 accent-[var(--color-brand-600)]"
        />
        Afficher seulement si
      </label>

      {condition ? (
        <>
          <select
            value={condition.field}
            onChange={(event) =>
              onChange({ visibleIf: { ...condition, field: event.target.value } })
            }
            className={cx(inputInlineClass, "py-1.5 text-xs")}
          >
            {earlierFields.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label || entry.id}
              </option>
            ))}
          </select>

          <select
            value={String(condition.value)}
            onChange={(event) =>
              onChange({
                visibleIf: {
                  ...condition,
                  op: "eq",
                  value: event.target.value === "true",
                },
              })
            }
            className={cx(inputInlineClass, "py-1.5 text-xs")}
          >
            <option value="true">vaut Oui</option>
            <option value="false">vaut Non</option>
          </select>

          {source && source.type !== "boolean" ? (
            <span className="text-xs text-caution">
              « {source.label} » n'est pas une question Oui / Non
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Règles de vigilance.
 *
 * Le message DÉCRIT ce que le patient a déclaré. Il ne recommande jamais une
 * conduite à tenir : une aide à la décision clinique ferait basculer Ryla dans
 * la catégorie dispositif médical (règlement UE 2017/745). L'avertissement est
 * affiché ici, et un contrôle rédactionnel tourne aussi à l'enregistrement.
 */
function VigilanceEditor({
  field,
  onChange,
}: {
  field: FormFieldDraft;
  onChange: (patch: Partial<FormFieldDraft>) => void;
}) {
  const rules = field.vigilance ?? [];

  const update = (index: number, patch: Partial<VigilanceDraft>) => {
    const next = rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
    onChange({ vigilance: next });
  };

  return (
    <div className="mt-3 rounded-lg border border-flame-100 bg-flame-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-flame-700">
          <IconAlert className="size-3.5" />
          Alertes de vigilance
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              vigilance: [
                ...rules,
                { level: "warning", value: true, message: "Le patient déclare…" },
              ],
            })
          }
        >
          Ajouter une alerte
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          Aucune alerte. Une alerte remonte en tête de fiche quand la réponse
          correspond.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rules.map((rule, index) => (
            <li key={index} className="rounded-md border border-flame-100 bg-surface p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={rule.level}
                  onChange={(event) =>
                    update(index, { level: event.target.value as VigilanceDraft["level"] })
                  }
                  className={cx(inputInlineClass, "py-1.5 text-xs")}
                >
                  <option value="info">Information</option>
                  <option value="warning">À noter</option>
                  <option value="critical">Critique</option>
                </select>

                <span className="text-xs text-muted">si la réponse est</span>

                <select
                  value={String(rule.value)}
                  onChange={(event) =>
                    update(index, { value: event.target.value === "true" })
                  }
                  className={cx(inputInlineClass, "py-1.5 text-xs")}
                >
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    onChange({ vigilance: rules.filter((_, i) => i !== index) })
                  }
                  className="ml-auto cursor-pointer text-xs text-faint transition hover:text-danger"
                >
                  Retirer
                </button>
              </div>

              <input
                value={rule.message}
                onChange={(event) => update(index, { message: event.target.value })}
                placeholder="Le patient déclare prendre un traitement anticoagulant."
                className={cx(inputClass, "mt-2 py-1.5 text-xs")}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-flame-700/80">
        Décrivez ce que le patient déclare — jamais une conduite à tenir. Une
        recommandation clinique relèverait du dispositif médical.
      </p>
    </div>
  );
}
