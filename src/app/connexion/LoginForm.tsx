"use client";

import Link from "next/link";
import { useActionState } from "react";
import { IconAlert } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Button, Field, inputClass } from "@/components/ui";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({
  showCabinetField,
  tenants,
  signupOpen,
}: {
  showCabinetField: boolean;
  /** Liste servie en local uniquement ; vide en production. */
  tenants: { slug: string; name: string }[];
  /** Faux quand l'inscription en ligne n'est pas ouverte : pas de lien mort. */
  signupOpen: boolean;
}) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {showCabinetField ? (
        <Field
          label="Cabinet"
          htmlFor="cabinet"
          required
          hint={
            tenants.length > 0
              ? "En production, cette information vient de votre sous-domaine."
              : "Identifiant du cabinet. En production, il vient de votre sous-domaine."
          }
        >
          {tenants.length > 0 ? (
            // Sélecteur plutôt que champ libre : personne ne peut deviner un
            // slug interne, et une faute de frappe renvoie « Identifiants
            // incorrects », message qui n'aide pas à comprendre.
            <select
              id="cabinet"
              name="cabinet"
              required
              defaultValue={tenants[0]?.slug}
              className={inputClass}
            >
              {tenants.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="cabinet"
              name="cabinet"
              required
              autoComplete="organization"
              placeholder="cabinet-martin"
              className={inputClass}
            />
          )}
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email" required>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className={inputClass}
        />
      </Field>

      <PasswordField
        label="Mot de passe"
        name="password"
        autoComplete="current-password"
        required
      />

      {state.error ? (
        // `role="alert"` : sans lui, un lecteur d'écran ne signale pas l'échec,
        // et la personne reste devant un formulaire qui n'a « rien fait ».
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
        >
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>

      {signupOpen ? (
        <p className="text-center text-sm text-muted">
          Pas encore de cabinet ?{" "}
          <Link
            href="/inscription"
            className="font-semibold text-brand-600 transition hover:text-brand-700"
          >
            En créer un
          </Link>
        </p>
      ) : null}
    </form>
  );
}
