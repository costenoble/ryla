"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { Button, Field, inputClass } from "@/components/ui";
import { createCabinet, type SignupState } from "@/lib/actions/signup";
import { DPA_SUMMARY, DPA_VERSION } from "@/lib/dpa";

const initial: SignupState = { status: "idle" };

/** Même règle que côté serveur, pour proposer l'identifiant à la frappe. */
function toSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function SignupForm({ requiresCode }: { requiresCode: boolean }) {
  const [state, action, pending] = useActionState(createCabinet, initial);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "created") router.push("/tableau-de-bord");
  }, [state, router]);

  const error = state.status === "error" ? state : null;
  const fieldError = (field: string) =>
    error?.field === field ? error.message : undefined;

  return (
    <form action={action} className="space-y-5">
      {requiresCode ? (
        <Field
          label="Code d'invitation"
          htmlFor="invitation"
          required
          error={fieldError("invitation")}
          hint="Fourni par Ryla."
        >
          <input id="invitation" name="invitation" required className={inputClass} />
        </Field>
      ) : null}

      <Field label="Nom du cabinet" htmlFor="name" required error={fieldError("name")}>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!touched) setSlug(toSlug(event.target.value));
          }}
          placeholder="Cabinet dentaire Martin"
          className={inputClass}
        />
      </Field>

      <Field
        label="Identifiant du cabinet"
        htmlFor="slug"
        required
        error={fieldError("slug")}
        hint="Il figure dans l'adresse de connexion et dans les liens envoyés aux patients. Il ne se change plus ensuite."
      >
        <input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setTouched(true);
            setSlug(toSlug(event.target.value));
          }}
          className={`${inputClass} font-mono text-sm`}
        />
      </Field>

      <Field label="Spécialité" htmlFor="specialty" required>
        <select id="specialty" name="specialty" className={inputClass} defaultValue="mixte">
          <option value="dentaire">Chirurgie dentaire et implantologie</option>
          <option value="esthetique">Médecine et chirurgie esthétique</option>
          <option value="mixte">Les deux</option>
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Votre nom" htmlFor="fullName" required error={fieldError("fullName")}>
          <input
            id="fullName"
            name="fullName"
            required
            autoComplete="name"
            placeholder="Dr Sophie Martin"
            className={inputClass}
          />
        </Field>
        <Field
          label="RPPS ou ADELI"
          htmlFor="rpps"
          error={fieldError("rpps")}
          hint="Obligatoire sur les devis conventionnels."
        >
          <input
            id="rpps"
            name="rpps"
            inputMode="numeric"
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      <Field label="Adresse email" htmlFor="email" required error={fieldError("email")}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field
        label="Mot de passe"
        htmlFor="password"
        required
        error={fieldError("password")}
        hint="10 caractères minimum. Ce compte ouvre des dossiers médicaux."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      {/* Article 28.3 du RGPD : sans contrat écrit, le cabinet est en infraction
          dès la première donnée saisie. On résume ce qui engage réellement —
          personne ne lit onze clauses dans un formulaire, et prétendre le
          contraire produit un consentement de façade. Le texte intégral reste à
          un clic, et c'est sa version qui est enregistrée. */}
      <div className="rounded-2xl border border-line bg-canvas p-4">
        <ul className="mb-3.5 space-y-1.5">
          {DPA_SUMMARY.map((line) => (
            <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <IconCheck className="mt-0.5 size-3.5 shrink-0 text-positive" />
              {line}
            </li>
          ))}
        </ul>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="dpa"
            required
            className="mt-0.5 size-4 shrink-0"
            aria-describedby="dpa-hint"
          />
          <span className="text-sm leading-relaxed text-body">
            J'accepte le{" "}
            <Link
              href="/sous-traitance"
              target="_blank"
              className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              contrat de sous-traitance
            </Link>{" "}
            et la{" "}
            <Link
              href="/confidentialite"
              target="_blank"
              className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              politique de confidentialité
            </Link>
            .
          </span>
        </label>

        <p id="dpa-hint" className="mt-2 text-xs leading-relaxed text-faint">
          Version {DPA_VERSION}. Votre acceptation est horodatée et conservée avec
          cette version — une évolution du texte ne la modifiera pas.
        </p>

        {fieldError("dpa") ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-danger">
            {fieldError("dpa")}
          </p>
        ) : null}
      </div>

      {error && !error.field ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
        >
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer mon cabinet"}
      </Button>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <IconLock className="mt-0.5 size-3.5 shrink-0" />
        Les réponses de vos patients sont chiffrées avec une clé propre à votre
        cabinet. Chaque consultation de dossier est journalisée.
      </p>

      <p className="text-center text-sm text-muted">
        Vous avez déjà un cabinet ?{" "}
        <Link href="/connexion" className="font-semibold text-brand-600 hover:text-brand-700">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
