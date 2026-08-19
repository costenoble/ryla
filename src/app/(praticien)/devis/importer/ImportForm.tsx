"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconLink, IconLock } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { Button, ButtonLink, Card, CardHeader, Field, inputClass } from "@/components/ui";
import {
  importQuoteForSignature,
  type ImportQuoteState,
} from "@/lib/actions/import-quote";

const initial: ImportQuoteState = { status: "idle" };

export type ImportPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

/**
 * Import d'un devis établi par le logiciel métier du cabinet.
 *
 * Le fichier n'est pas relu ni réécrit par Ryla : il est scellé par son
 * empreinte et reproduit page pour page dans le document signé. Ce que Ryla
 * ajoute, c'est la preuve — temps de lecture, déclarations horodatées, chaîne
 * d'audit.
 */
export function ImportForm({
  patients,
  specialty,
  initialPatientId,
}: {
  patients: ImportPatient[];
  specialty: "dentaire" | "esthetique" | "mixte";
  initialPatientId: string | null;
}) {
  const [state, action, pending] = useActionState(importQuoteForSignature, initial);
  const [kind, setKind] = useState<"dentaire" | "esthetique">(
    specialty === "esthetique" ? "esthetique" : "dentaire",
  );

  if (state.status === "sent") return <Result state={state} />;

  return (
    <form action={action}>
      <Card>
        <CardHeader
          title="Devis à faire signer"
          subtitle="Le PDF produit par Logos, VisioDent, Julie… Ryla ne le modifie pas."
        />
        <div className="space-y-5 p-5">
          <Field label="Patient" htmlFor="patientId" required>
            <select
              id="patientId"
              name="patientId"
              required
              defaultValue={initialPatientId ?? ""}
              className={inputClass}
            >
              <option value="">Choisir un patient…</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.lastName} {patient.firstName}
                  {patient.email ? "" : " — sans email"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Régime du devis" htmlFor="kind" required>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["dentaire", "Dentaire"],
                  ["esthetique", "Chirurgie esthétique"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    kind === value
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {kind === "esthetique" ? (
            <p className="rounded-md bg-caution-soft px-3.5 py-3 text-xs leading-relaxed text-caution">
              Les déclarations à cocher rappelleront le délai de réflexion de quinze
              jours (art. D6322-30 CSP) et son caractère non dérogeable.
            </p>
          ) : null}

          <Field
            label="Fichier du devis"
            htmlFor="document"
            required
            hint="PDF uniquement, 15 Mo maximum."
          >
            <input
              id="document"
              type="file"
              name="document"
              accept="application/pdf"
              required
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3.5 file:py-2.5 file:text-sm file:font-medium file:text-body"
            />
          </Field>

          <Field
            label="Logiciel d'origine"
            htmlFor="source"
            hint="Facultatif. Consigné au dossier de preuve."
          >
            <input
              id="source"
              name="source"
              placeholder="Logos, VisioDent, Julie…"
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer au patient pour signature"}
            </Button>
            <Link
              href="/devis"
              className="text-sm font-medium text-muted transition hover:text-body"
            >
              Annuler
            </Link>
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
        </div>
      </Card>
    </form>
  );
}

function Result({ state }: { state: Extract<ImportQuoteState, { status: "sent" }> }) {
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
                ? `Devis envoyé à ${state.patientName}`
                : `Devis prêt pour ${state.patientName}`}
            </h2>
            <p className="mt-0.5 text-sm text-positive/90">
              {state.emailedTo
                ? `Message remis à ${state.emailedTo}. Lien valable jusqu'au ${expires}.`
                : `Lien valable jusqu'au ${expires}.`}
            </p>
          </div>
        </div>

        <div className="p-5">
          {state.deliveryError ? (
            <p className="mb-5 rounded-md bg-caution-soft px-3.5 py-3 text-sm leading-relaxed text-caution">
              <span className="font-semibold">L'email n'est pas parti.</span> Le devis
              est bien enregistré — transmettez le lien ci-dessous vous-même.
            </p>
          ) : null}

          {!state.emailedTo && !state.deliveryError ? (
            <p className="mb-5 rounded-md bg-canvas px-3.5 py-3 text-sm leading-relaxed text-muted">
              Ce patient n'a pas d'adresse email : le lien est à transmettre à la main.
            </p>
          ) : null}

          <label htmlFor="lien" className="block text-sm font-semibold text-body">
            Lien de signature
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
              className="shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(state.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-md bg-brand-50 px-3.5 py-3 text-xs leading-relaxed text-brand-700">
            <IconLock className="mt-0.5 size-3.5 shrink-0" />
            Le patient lira le devis dans le portail, et non en pièce jointe : le temps
            de lecture est mesuré et entre au dossier de preuve.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <ButtonLink href={state.url} target="_blank" rel="noreferrer">
              <IconLink className="size-4" />
              Ouvrir le portail patient
            </ButtonLink>
            <ButtonLink href={`/dossiers/${state.submissionId}`} variant="outline">
              Voir le dossier
            </ButtonLink>
            <ButtonLink href="/devis/importer" variant="ghost">
              Importer un autre devis
            </ButtonLink>
          </div>
        </div>
      </Card>
    </FadeUp>
  );
}
