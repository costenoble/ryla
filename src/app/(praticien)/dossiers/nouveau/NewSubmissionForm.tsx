"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconLink, IconLock } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { Badge, Button, ButtonLink, Card, Field, inputClass } from "@/components/ui";
import { createAndSend, type NewSubmissionState } from "@/lib/actions/dossiers";

const initial: NewSubmissionState = { status: "idle" };

const KIND_LABELS: Record<string, string> = {
  questionnaire: "Questionnaire",
  consentement: "Consentement",
  devis: "Devis",
  droit_image: "Droit à l'image",
};

export function NewSubmissionForm({
  templates,
  patient,
}: {
  templates: { id: string; title: string; kind: string }[];
  /** Pré-rempli quand l'envoi part d'une fiche patient. */
  patient?: { firstName: string; lastName: string; birthDate: string; email: string };
}) {
  const [state, formAction, pending] = useActionState(createAndSend, initial);

  if (state.status === "created") {
    return <Result state={state} />;
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        <Field label="Document à envoyer" htmlFor="templateId" required>
          <select id="templateId" name="templateId" required className={inputClass}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {KIND_LABELS[template.kind] ?? template.kind} — {template.title}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="firstName" required>
            <input
              id="firstName"
              name="firstName"
              required
              defaultValue={patient?.firstName}
              className={inputClass}
            />
          </Field>
          <Field label="Nom" htmlFor="lastName" required>
            <input
              id="lastName"
              name="lastName"
              required
              defaultValue={patient?.lastName}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date de naissance" htmlFor="birthDate">
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={patient?.birthDate}
              className={inputClass}
            />
          </Field>
          <Field
            label="Email du patient"
            htmlFor="email"
            hint="Sert uniquement à retrouver le patient. Aucun document n'y est envoyé."
          >
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={patient?.email}
              className={inputClass}
            />
          </Field>
        </div>

        {state.status === "error" ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
          >
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button type="submit" disabled={pending} size="lg">
            {pending ? "Création…" : "Créer le lien patient"}
          </Button>
          <Link
            href="/patients"
            className="text-sm font-medium text-muted transition hover:text-body"
          >
            Annuler
          </Link>
        </div>
      </form>
    </Card>
  );
}

function Result({ state }: { state: Extract<NewSubmissionState, { status: "created" }> }) {
  const [copied, setCopied] = useState(false);
  const expires = new Date(state.expiresAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <FadeUp>
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3.5 border-b border-line bg-positive-soft p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-positive text-white">
            <IconCheck className="size-5" />
          </span>
          <div>
            <h2 className="font-bold text-positive">
              {state.emailedTo
                ? `Document envoyé à ${state.patientName}`
                : `Lien créé pour ${state.patientName}`}
            </h2>
            <p className="mt-0.5 text-sm text-positive/90">
              {state.emailedTo
                ? `Message remis à ${state.emailedTo}. Lien valable jusqu'au ${expires}.`
                : `Valable jusqu'au ${expires}. Il se désactive dès la signature.`}
            </p>
          </div>
        </div>

        <div className="p-5">
          {/* Un envoi qui a échoué ne doit pas se deviner : le praticien croirait
              le patient prévenu et attendrait une signature qui ne viendra pas. */}
          {state.deliveryError ? (
            <p className="mb-5 rounded-md bg-caution-soft px-3.5 py-3 text-sm leading-relaxed text-caution">
              <span className="font-semibold">L'email n'est pas parti.</span> Le dossier
              est bien créé et le lien ci-dessous reste valable — transmettez-le au
              patient par le canal de votre choix.
            </p>
          ) : null}

          {!state.emailedTo && !state.deliveryError ? (
            <p className="mb-5 rounded-md bg-canvas px-3.5 py-3 text-sm leading-relaxed text-muted">
              Aucune adresse email n'est renseignée pour ce patient : le lien est à
              transmettre à la main.
            </p>
          ) : null}

          <label
            htmlFor="lien"
            className="block text-sm font-semibold text-body"
          >
            Lien à transmettre au patient
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="lien"
              readOnly
              value={state.url}
              onFocus={(event) => event.currentTarget.select()}
              className={`${inputClass} font-mono text-xs`}
            />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0"
            >
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>

          {/* Le rappel qui fait la différence à la démonstration : ce n'est pas
              une commodité, c'est la raison pour laquelle le lien existe. */}
          <p className="mt-4 flex items-start gap-2 rounded-md bg-brand-50 px-3.5 py-3 text-xs leading-relaxed text-brand-700">
            <IconLock className="mt-0.5 size-3.5 shrink-0" />
            Ce lien ne contient aucune donnée de santé. Transmis par email ou SMS, il
            ne révèle ni le motif, ni la spécialité, ni le type de document.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <ButtonLink href={state.url} target="_blank" rel="noreferrer" variant="primary">
              <IconLink className="size-4" />
              Ouvrir le portail patient
            </ButtonLink>
            <ButtonLink href={`/dossiers/${state.submissionId}`} variant="outline">
              Voir le document
            </ButtonLink>
            <ButtonLink href="/dossiers/nouveau" variant="ghost">
              Nouvel envoi
            </ButtonLink>
            <Badge tone="brand" className="ml-auto">
              Statut : envoyé
            </Badge>
          </div>
        </div>
      </Card>
    </FadeUp>
  );
}
