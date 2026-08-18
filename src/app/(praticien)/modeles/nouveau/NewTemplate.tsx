"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { IconAlert, IconFile, IconSparkle, IconTemplate } from "@/components/icons";
import { Badge, Button, Card, cx, inputClass } from "@/components/ui";
import { importFromLibrary, type ImportState } from "@/lib/actions/templates";
import { draftFromText, summarizeDraft } from "../editeur/import-text";
import { TemplateEditor } from "../editeur/TemplateEditor";
import { emptyDraft, type TemplateDraft } from "../editeur/types";

/**
 * Trois façons de commencer un modèle, parce qu'il y a trois situations réelles :
 * le cabinet a déjà son questionnaire papier, il veut partir d'un texte rédigé
 * par Ryla, ou il écrit le sien de zéro.
 */

type Mode = "choix" | "import" | "bibliotheque" | "editeur";

export type LibraryChoice = {
  libraryRef: string;
  title: string;
  kind: string;
  specialty: string;
  description: string | null;
  questionCount: number;
  /** Déjà présent dans le cabinet : on le signale sans l'interdire. */
  installed: boolean;
};

const KIND_LABELS: Record<string, string> = {
  questionnaire: "Questionnaire",
  consentement: "Consentement",
  devis: "Devis",
  droit_image: "Droit à l'image",
};

export function NewTemplate({ choices }: { choices: LibraryChoice[] }) {
  const [mode, setMode] = useState<Mode>("choix");
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  if (mode === "editeur" && draft) {
    return <TemplateEditor kind="questionnaire" initialDraft={draft} />;
  }

  if (mode === "import") {
    return (
      <ImportPanel
        onCancel={() => setMode("choix")}
        onReady={(next) => {
          setDraft(next);
          setMode("editeur");
        }}
      />
    );
  }

  if (mode === "bibliotheque") {
    return <LibraryPanel choices={choices} onCancel={() => setMode("choix")} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Choice
        icon={<IconFile className="size-5" />}
        title="Importer mon questionnaire"
        description="Collez le texte de votre questionnaire papier, Word ou PDF. Il est découpé en questions, que vous corrigez ensuite."
        action="Coller mon texte"
        onClick={() => setMode("import")}
      />
      <Choice
        icon={<IconSparkle className="size-5" />}
        title="Partir d'un modèle Ryla"
        description="Des textes rédigés pour tenir devant un juge : anamnèse, consentement éclairé, droit à l'image. Modifiables une fois installés."
        action="Voir la bibliothèque"
        onClick={() => setMode("bibliotheque")}
      />
      <Choice
        icon={<IconTemplate className="size-5" />}
        title="Partir de zéro"
        description="Un formulaire vide. Vous écrivez vos sections, vos questions et vos alertes."
        action="Créer un formulaire"
        onClick={() => {
          setDraft(emptyDraft());
          setMode("editeur");
        }}
      />
    </div>
  );
}

function Choice({
  icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <h2 className="font-semibold text-body">{title}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{description}</p>
      <Button type="button" variant="outline" className="mt-4 w-full" onClick={onClick}>
        {action}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const EXAMPLE = `ANTÉCÉDENTS MÉDICAUX

Êtes-vous suivi(e) pour une maladie chronique ?
Prenez-vous un traitement anticoagulant ?
Quels médicaments prenez-vous actuellement :

ALLERGIES

Avez-vous des allergies connues ?
- Pénicilline
- Latex
- Anesthésiques locaux`;

function ImportPanel({
  onCancel,
  onReady,
}: {
  onCancel: () => void;
  onReady: (draft: TemplateDraft) => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");

  // L'analyse est instantanée et sans effet de bord : on peut la montrer en
  // continu, ce qui laisse corriger la source plutôt que de subir le résultat.
  const draft = useMemo(
    () => (text.trim() === "" ? null : draftFromText(text, title)),
    [text, title],
  );
  const summary = draft ? summarizeDraft(draft) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-body">
            Titre du questionnaire
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Anamnèse — cabinet dentaire Martin"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-muted">
            À défaut, la première ligne du texte sera reprise.
          </span>
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold text-body">
            Votre questionnaire <span className="text-flame-600">*</span>
          </span>
          <textarea
            rows={18}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={EXAMPLE}
            className={cx(inputClass, "font-mono text-[13px] leading-relaxed")}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>
            Voir un exemple
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Retour
          </Button>
        </div>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <p className="text-sm font-semibold text-body">Ce qui a été reconnu</p>

          {summary ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <Count label="Sections" value={summary.sections} />
              <Count label="Questions" value={summary.questions} />
              <Count label="Listes de choix" value={summary.choices} />
              <Count label="Textes d'information" value={summary.infos} />
            </dl>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Collez votre texte : l'analyse s'affiche ici au fur et à mesure.
            </p>
          )}

          <Button
            type="button"
            className="mt-4 w-full"
            disabled={!draft || summary?.questions === 0}
            onClick={() => draft && onReady(draft)}
          >
            Ouvrir dans l'éditeur
          </Button>

          <p className="mt-2 text-xs leading-relaxed text-muted">
            Rien n'est publié à cette étape. Vous relisez et corrigez avant
            d'enregistrer.
          </p>
        </Card>

        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-body">
            <IconAlert className="size-4 text-brand-600" />
            Règles de lecture
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>
              <b className="text-body">UNE LIGNE EN MAJUSCULES</b> ouvre une section.
            </li>
            <li>
              Une ligne finissant par <b className="text-body">?</b> devient une question
              Oui / Non.
            </li>
            <li>
              Une ligne finissant par <b className="text-body">:</b> devient une réponse
              libre.
            </li>
            <li>
              Une ligne commençant par <b className="text-body">-</b> est une réponse
              proposée à la question du dessus.
            </li>
            <li>Un paragraphe long devient un texte d'information.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-semibold text-body">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LibraryPanel({
  choices,
  onCancel,
}: {
  choices: LibraryChoice[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importFromLibrary,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status === "imported") router.push(`/modeles/${state.templateId}`);
  }, [state, router]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Le modèle est copié dans votre cabinet : vous pouvez ensuite en modifier
          chaque question.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Retour
        </Button>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {choices.map((choice) => (
          <Card key={choice.libraryRef} className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-body">{choice.title}</h2>
              <Badge tone={choice.kind === "questionnaire" ? "brand" : "ink"}>
                {KIND_LABELS[choice.kind] ?? choice.kind}
              </Badge>
            </div>

            {choice.description ? (
              <p className="mt-2.5 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
                {choice.description}
              </p>
            ) : (
              <div className="flex-1" />
            )}

            <div className="mt-4 flex items-center gap-3">
              <form action={action}>
                <input type="hidden" name="libraryRef" value={choice.libraryRef} />
                <Button type="submit" variant="outline" size="sm" disabled={pending}>
                  {pending ? "Installation…" : choice.installed ? "Installer à nouveau" : "Installer"}
                </Button>
              </form>
              <span className="tabular text-xs text-faint">
                {choice.questionCount} question(s)
              </span>
              {choice.installed ? (
                <span className="ml-auto text-xs text-positive">Déjà installé</span>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
