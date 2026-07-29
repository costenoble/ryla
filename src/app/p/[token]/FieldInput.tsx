"use client";

import type { AnswerValue, FormField } from "@/lib/form-schema";

/**
 * Rendu d'un champ du questionnaire.
 *
 * Écrit pour le téléphone en premier : une bonne partie des questionnaires se
 * remplit en salle d'attente, à une main. D'où les grandes cibles tactiles et
 * les boutons Oui/Non plutôt qu'une case à cocher — une case décochée est
 * ambiguë (« non » ou « pas encore répondu » ?), et cette ambiguïté finit dans
 * le dossier médical.
 */

type Props = {
  field: FormField;
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue) => void;
};

const inputClass =
  "w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] " +
  "text-body shadow-tile transition placeholder:text-faint " +
  "brand-focus";

export function FieldInput({ field, value, error, onChange }: Props) {
  if (field.type === "info") {
    return (
      <div className="rounded-2xl border border-line bg-canvas p-4">
        <p className="text-sm font-semibold text-body">{field.label}</p>
        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-muted">
          {field.body}
        </p>
      </div>
    );
  }

  const describedBy = error ? `${field.id}-error` : field.help ? `${field.id}-help` : undefined;

  if (field.type === "consent" || field.type === "photo_consent") {
    const checked = value === true;
    return (
      <div>
        <label
          className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
            checked
              ? "brand-border brand-soft"
              : "border-line bg-surface hover:border-line-strong"
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 brand-accent"
            checked={checked}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="text-sm leading-relaxed text-body">
            {field.statement}
            {field.required ? <span className="text-danger"> *</span> : null}
          </span>
        </label>
        {field.help ? (
          <p id={`${field.id}-help`} className="mt-1.5 text-xs text-muted">
            {field.help}
          </p>
        ) : null}
        {error ? (
          <p id={`${field.id}-error`} className="mt-1.5 text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={field.id} className="block text-sm font-medium text-body">
        {field.label}
        {field.required ? <span className="text-danger"> *</span> : null}
      </label>
      {field.help ? (
        <p id={`${field.id}-help`} className="mt-1 text-xs text-muted">
          {field.help}
        </p>
      ) : null}

      <div className="mt-2">
        {renderControl(field, value, onChange, describedBy)}
      </div>

      {error ? (
        <p id={`${field.id}-error`} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function renderControl(
  field: FormField,
  value: AnswerValue | undefined,
  onChange: (value: AnswerValue) => void,
  describedBy: string | undefined,
) {
  switch (field.type) {
    case "boolean": {
      // Oui / Non explicites : pas de troisième état implicite.
      return (
        <div className="flex gap-2">
          {[
            { label: "Oui", answer: true },
            { label: "Non", answer: false },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={value === option.answer}
              onClick={() => onChange(option.answer)}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                value === option.answer
                  ? "brand-border brand-bg text-white shadow-tile"
                  : "border-line-strong bg-surface text-body hover:border-line-strong"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    case "select":
      return (
        <select
          id={field.id}
          className={inputClass}
          value={value === undefined || value === null ? "" : String(value)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Sélectionnez…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {field.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  checked
                    ? "brand-border brand-soft"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4.5 brand-accent"
                  checked={checked}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((item) => item !== option.value),
                    )
                  }
                />
                <span className="text-sm text-body">{option.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case "textarea":
      return (
        <textarea
          id={field.id}
          rows={4}
          maxLength={field.maxLength}
          className={inputClass}
          value={value === undefined || value === null ? "" : String(value)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "number":
      return (
        <div className="flex items-center gap-2">
          <input
            id={field.id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            className={inputClass}
            value={value === undefined || value === null ? "" : String(value)}
            aria-describedby={describedBy}
            onChange={(event) =>
              onChange(event.target.value === "" ? null : Number(event.target.value))
            }
          />
          {field.unit ? (
            <span className="shrink-0 text-sm text-muted">{field.unit}</span>
          ) : null}
        </div>
      );

    case "scale": {
      const current = typeof value === "number" ? value : null;
      return (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min + index).map(
              (step) => (
                <button
                  key={step}
                  type="button"
                  aria-pressed={current === step}
                  onClick={() => onChange(step)}
                  className={`size-9 rounded-xl border text-sm font-medium transition ${
                    current === step
                      ? "brand-border brand-bg text-white"
                      : "border-line-strong bg-surface text-body hover:border-line-strong"
                  }`}
                >
                  {step}
                </button>
              ),
            )}
          </div>
          {field.minLabel || field.maxLabel ? (
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{field.minLabel}</span>
              <span>{field.maxLabel}</span>
            </div>
          ) : null}
        </div>
      );
    }

    case "date":
      return (
        <input
          id={field.id}
          type="date"
          min={field.min}
          max={field.max}
          className={inputClass}
          value={value === undefined || value === null ? "" : String(value)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "email":
    case "phone":
    case "text":
    default:
      return (
        <input
          id={field.id}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          className={inputClass}
          value={value === undefined || value === null ? "" : String(value)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
