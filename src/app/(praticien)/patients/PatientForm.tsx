"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { IconAlert } from "@/components/icons";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { savePatient, type PatientFormState } from "@/lib/actions/patients";

const initial: PatientFormState = { status: "idle" };

export type PatientFormValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  notes?: string;
  needsLegalRepresentative?: boolean;
  legalRepresentative?: {
    fullName?: string;
    relationship?: string;
    email?: string;
    phone?: string;
  } | null;
};

export function PatientForm({ values = {} }: { values?: PatientFormValues }) {
  const [state, formAction, pending] = useActionState(savePatient, initial);
  const [needsRep, setNeedsRep] = useState(values.needsLegalRepresentative ?? false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "saved") router.push(`/patients/${state.patientId}`);
  }, [state, router]);

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        {values.id ? <input type="hidden" name="patientId" value={values.id} /> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="firstName" required>
            <input
              id="firstName"
              name="firstName"
              required
              defaultValue={values.firstName}
              className={inputClass}
            />
          </Field>
          <Field label="Nom" htmlFor="lastName" required>
            <input
              id="lastName"
              name="lastName"
              required
              defaultValue={values.lastName}
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
              defaultValue={values.birthDate}
              className={inputClass}
            />
          </Field>
          <Field label="Téléphone" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Email"
          htmlFor="email"
          hint="Sert à transmettre le lien vers le portail. Aucun document n'y est joint."
        >
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            className={inputClass}
          />
        </Field>

        {/* Mineurs et majeurs protégés : c'est le représentant légal qui signe.
            Systématiquement oublié ailleurs, et pourtant obligatoire. */}
        <div className="rounded-lg border border-line bg-canvas/60 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="needsLegalRepresentative"
              checked={needsRep}
              onChange={(event) => setNeedsRep(event.target.checked)}
              className="mt-0.5 size-4.5 accent-[var(--color-brand-600)]"
            />
            <span>
              <span className="block text-sm font-semibold text-body">
                Mineur ou majeur protégé
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Les consentements devront être signés par son représentant légal.
              </span>
            </span>
          </label>

          {needsRep ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nom du représentant" htmlFor="repFullName" required>
                <input
                  id="repFullName"
                  name="repFullName"
                  defaultValue={values.legalRepresentative?.fullName}
                  className={inputClass}
                />
              </Field>
              <Field label="Lien avec le patient" htmlFor="repRelationship">
                <input
                  id="repRelationship"
                  name="repRelationship"
                  placeholder="Mère, père, tuteur…"
                  defaultValue={values.legalRepresentative?.relationship}
                  className={inputClass}
                />
              </Field>
              <Field label="Email du représentant" htmlFor="repEmail">
                <input
                  id="repEmail"
                  name="repEmail"
                  type="email"
                  defaultValue={values.legalRepresentative?.email}
                  className={inputClass}
                />
              </Field>
              <Field label="Téléphone du représentant" htmlFor="repPhone">
                <input
                  id="repPhone"
                  name="repPhone"
                  type="tel"
                  defaultValue={values.legalRepresentative?.phone}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <Field
          label="Notes internes"
          htmlFor="notes"
          hint="Visible du cabinet uniquement, jamais du patient."
        >
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values.notes}
            className={inputClass}
          />
        </Field>

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
            {pending ? "Enregistrement…" : values.id ? "Enregistrer" : "Créer le patient"}
          </Button>
          <Link
            href={values.id ? `/patients/${values.id}` : "/patients"}
            className="text-sm font-medium text-muted transition hover:text-body"
          >
            Annuler
          </Link>
        </div>
      </form>
    </Card>
  );
}
