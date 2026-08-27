"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeVisibility, validateAnswers } from "@/lib/branching";
import type { AnswerValue, Answers, FormDefinition } from "@/lib/form-schema";
import { FieldInput } from "./FieldInput";
import { SignaturePad } from "./SignaturePad";

/**
 * Portail patient.
 *
 * Découpé section par section plutôt qu'en page unique : sur un questionnaire
 * de quarante questions, la page unique fait abandonner. Les réponses sont
 * enregistrées au fil de l'eau — un patient interrompu doit pouvoir rouvrir
 * son lien et reprendre où il en était.
 *
 * La visibilité conditionnelle est calculée avec exactement le même moteur que
 * côté serveur. Ce qui s'affiche ici est ce qui sera validé là-bas.
 */

type Props = {
  token: string;
  definition: FormDefinition;
  initialAnswers: Answers;
  tenantName: string;
  /** Devis importé du logiciel métier, à lire avant de signer. */
  attachment?: { filename: string } | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function PortalForm({
  token,
  definition,
  initialAnswers,
  tenantName,
  attachment,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [statements, setStatements] = useState<Record<string, string>>({});
  const [signerName, setSignerName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const visibility = useMemo(
    () => computeVisibility(definition, answers),
    [definition, answers],
  );

  const needsSignature = definition.signature?.required ?? false;
  const totalSteps = visibility.sections.length + (needsSignature ? 1 : 0);
  const isSignatureStep = needsSignature && stepIndex === visibility.sections.length;
  const currentSection = visibility.sections[Math.min(stepIndex, visibility.sections.length - 1)];

  // -------------------------------------------------------------------------
  // Mesure du temps passé par section (élément du faisceau de preuves)
  // -------------------------------------------------------------------------
  const dwell = useRef<Record<string, number>>({});
  const marker = useRef<{ sectionId: string; since: number } | null>(null);

  const flushDwell = useCallback(() => {
    const current = marker.current;
    if (!current) return;
    const elapsed = Date.now() - current.since;
    dwell.current[current.sectionId] = (dwell.current[current.sectionId] ?? 0) + elapsed;
    marker.current = null;
  }, []);

  useEffect(() => {
    const sectionId = isSignatureStep ? "__signature" : currentSection?.section.id;
    if (!sectionId) return;
    flushDwell();
    marker.current = { sectionId, since: Date.now() };

    // Onglet masqué : on arrête le compteur, sinon un onglet oublié la nuit
    // ferait état de huit heures de lecture attentive.
    const onVisibility = () => {
      if (document.hidden) flushDwell();
      else marker.current = { sectionId, since: Date.now() };
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flushDwell();
    };
  }, [stepIndex, currentSection?.section.id, isSignatureStep, flushDwell]);

  // -------------------------------------------------------------------------
  // Enregistrement au fil de l'eau
  // -------------------------------------------------------------------------
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (done) return;

    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/p/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", answers }),
        });
        setSaveState(response.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [answers, token, done]);

  const update = (fieldId: string, value: AnswerValue) => {
    setAnswers((previous) => ({ ...previous, [fieldId]: value }));
    setErrors((previous) => {
      if (!previous[fieldId]) return previous;
      const next = { ...previous };
      delete next[fieldId];
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const goNext = () => {
    if (currentSection && !isSignatureStep) {
      const validation = validateAnswers(definition, answers);
      const sectionIds = new Set(currentSection.fields.map((field) => field.id));
      const sectionErrors = Object.fromEntries(
        Object.entries(validation.errors).filter(([key]) => sectionIds.has(key)),
      );
      if (Object.keys(sectionErrors).length > 0) {
        setErrors(sectionErrors);
        return;
      }
    }
    setErrors({});
    setStepIndex((index) => Math.min(index + 1, totalSteps - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setErrors({});
    setStepIndex((index) => Math.max(0, index - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // -------------------------------------------------------------------------
  // Signature
  // -------------------------------------------------------------------------
  const toggleStatement = (id: string, accepted: boolean) => {
    setStatements((previous) => {
      const next = { ...previous };
      // On enregistre l'instant exact de la coche : c'est cet horodatage qui
      // figure dans le dossier de preuve, pas celui de l'envoi.
      if (accepted) next[id] = new Date().toISOString();
      else delete next[id];
      return next;
    });
  };

  const requiredStatements = definition.signature?.statements.filter((s) => s.required) ?? [];
  const allStatementsAccepted = requiredStatements.every((s) => statements[s.id]);
  const canSubmit = signerName.trim().length >= 2 && allStatementsAccepted && !submitting;

  const submit = async () => {
    flushDwell();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`/api/p/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          answers,
          signerName: signerName.trim(),
          signatureImage,
          statements: Object.entries(statements).map(([id, acceptedAt]) => ({
            id,
            acceptedAt,
          })),
          dwell: Object.entries(dwell.current).map(([sectionId, ms]) => ({ sectionId, ms })),
          locale: definition.locale,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      if (response.ok) {
        setDone(true);
        window.scrollTo({ top: 0 });
        return;
      }

      const payload = (await response.json()) as {
        error?: string;
        errors?: Record<string, string>;
      };

      if (payload.errors) {
        // Le serveur a recalculé la visibilité et trouvé une obligation non
        // satisfaite : on ramène le patient sur la section concernée.
        setErrors(payload.errors);
        const firstFieldId = Object.keys(payload.errors)[0];
        const target = visibility.sections.findIndex((entry) =>
          entry.fields.some((field) => field.id === firstFieldId),
        );
        if (target >= 0) setStepIndex(target);
        setSubmitError("Certaines réponses obligatoires sont manquantes ou invalides.");
      } else if (payload.error === "already_signed") {
        setSubmitError("Ce document a déjà été signé.");
      } else {
        setSubmitError("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
      }
    } catch {
      setSubmitError("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  if (done) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-tile">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full brand-soft">
          <svg viewBox="0 0 24 24" className="size-7 brand-text" aria-hidden="true">
            <path
              d="m5 13 4 4L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-semibold text-body">C'est enregistré</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Votre document a été transmis à {tenantName} et signé. Un exemplaire est
          conservé à votre dossier ; vous pouvez en demander une copie au cabinet à
          tout moment.
        </p>
        <p className="mt-5 text-xs text-muted">
          Ce lien est maintenant désactivé. Vous pouvez fermer cette page.
        </p>
      </div>
    );
  }

  const progress = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;

  return (
    <div>
      {/* Progression */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>
            Étape {stepIndex + 1} sur {totalSteps}
          </span>
          <SaveIndicator state={saveState} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full brand-bg transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-6 shadow-tile sm:p-8">
        {isSignatureStep ? (
          <SignatureStep
            definition={definition}
            statements={statements}
            onToggleStatement={toggleStatement}
            signerName={signerName}
            onSignerName={setSignerName}
            onSignature={setSignatureImage}
          />
        ) : currentSection ? (
          <section>
            <h2 className="text-lg font-semibold text-body">
              {currentSection.section.title}
            </h2>
            {currentSection.section.description ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {currentSection.section.description}
              </p>
            ) : null}

            {/* La pièce n'apparaît que sur la première étape : c'est là qu'on
                demande au patient de la lire, et le compteur de temps de cette
                section est précisément ce qui l'atteste. */}
            {attachment && stepIndex === 0 ? (
              <AttachmentViewer token={token} filename={attachment.filename} />
            ) : null}

            <div className="mt-6 space-y-5">
              {currentSection.fields.map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={answers[field.id]}
                  error={errors[field.id]}
                  onChange={(value) => update(field.id, value)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {submitError ? (
          <p className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {submitError}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-canvas disabled:invisible"
          >
            Précédent
          </button>

          {isSignatureStep ? (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-xl brand-bg px-6 py-2.5 text-sm font-semibold text-white shadow-tile transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Envoi…" : "Signer et envoyer"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="rounded-xl brand-bg px-6 py-2.5 text-sm font-semibold text-white shadow-tile transition hover:opacity-90"
            >
              {stepIndex === totalSteps - 1 ? "Terminer" : "Continuer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Affichage du devis importé.
 *
 * `<object>` plutôt qu'`<iframe>` : il permet un contenu de repli quand le
 * navigateur ne sait pas afficher un PDF en ligne — ce qui reste courant sur
 * mobile. Sans ce repli, le patient verrait un cadre vide et signerait un
 * document qu'il n'a pas pu lire, ce qui viderait la preuve de son sens.
 */
function AttachmentViewer({ token, filename }: { token: string; filename: string }) {
  const url = `/api/p/${token}/piece`;

  return (
    <div className="mt-5">
      <object
        data={url}
        type="application/pdf"
        className="h-[60vh] min-h-80 w-full rounded-xl border border-line bg-canvas"
        aria-label={`Devis ${filename}`}
      >
        <div className="p-6 text-center">
          <p className="text-sm text-muted">
            Votre navigateur n'affiche pas les PDF directement.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-xl brand-bg px-5 py-2.5 text-sm font-semibold text-white"
          >
            Ouvrir le devis
          </a>
        </div>
      </object>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm font-medium underline underline-offset-2 brand-text"
      >
        Ouvrir le devis dans un nouvel onglet
      </a>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span>Enregistrement…</span>;
  if (state === "saved") return <span className="text-faint">Réponses enregistrées</span>;
  if (state === "error") return <span className="text-caution">Enregistrement différé</span>;
  return null;
}

function SignatureStep({
  definition,
  statements,
  onToggleStatement,
  signerName,
  onSignerName,
  onSignature,
}: {
  definition: FormDefinition;
  statements: Record<string, string>;
  onToggleStatement: (id: string, accepted: boolean) => void;
  signerName: string;
  onSignerName: (value: string) => void;
  onSignature: (dataUrl: string | null) => void;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-body">Signature</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Relisez les déclarations ci-dessous avant de signer.
      </p>

      <div className="mt-6 space-y-3">
        {definition.signature?.statements.map((statement) => {
          const accepted = Boolean(statements[statement.id]);
          return (
            <label
              key={statement.id}
              className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${
                accepted
                  ? "brand-border brand-soft"
                  : "border-line-strong bg-canvas hover:border-brand-400 hover:bg-brand-50"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 brand-accent"
                checked={accepted}
                onChange={(event) => onToggleStatement(statement.id, event.target.checked)}
              />
              <span className="text-sm leading-relaxed text-body">
                {statement.text}
                {statement.required ? <span className="text-danger"> *</span> : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-6">
        <label htmlFor="signer-name" className="block text-sm font-medium text-body">
          Vos nom et prénom <span className="text-danger">*</span>
        </label>
        <input
          id="signer-name"
          type="text"
          autoComplete="name"
          value={signerName}
          onChange={(event) => onSignerName(event.target.value)}
          className="mt-2 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] shadow-tile brand-focus"
        />
      </div>

      <div className="mt-6">
        <SignaturePad onChange={onSignature} />
      </div>

      {definition.legalNotice ? (
        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          {definition.legalNotice}
        </p>
      ) : null}
    </section>
  );
}
