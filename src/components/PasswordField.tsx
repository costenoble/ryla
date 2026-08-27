"use client";

import { useId, useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";
import { Field, inputClass } from "@/components/ui";

/**
 * Champ de mot de passe, avec bouton d'affichage.
 *
 * On exige dix caractères minimum sur un compte qui ouvre des dossiers
 * médicaux : sans moyen de relire ce qu'on a tapé, cette exigence pousse
 * mécaniquement vers des mots de passe courts et connus par cœur, ou vers un
 * post-it. Pouvoir vérifier sa saisie est donc une mesure de sécurité, pas un
 * confort.
 *
 * L'état revient toujours à « masqué » au chargement : personne ne veut
 * retrouver son mot de passe en clair à l'écran parce qu'il l'avait affiché la
 * fois précédente.
 *
 * `autoComplete` reste porté par le champ réel, pour que les gestionnaires de
 * mots de passe continuent de faire leur travail.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  required,
  minLength,
  hint,
  error,
  defaultValue,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  hint?: string;
  error?: string;
  defaultValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <Field label={label} htmlFor={id} required={required} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          // Place réservée au bouton : sans cette marge, un mot de passe long
          // passe dessous et devient illisible au moment précis où on l'affiche.
          className={`${inputClass} pr-12`}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          // Le libellé décrit l'action à venir, pas l'état courant : un lecteur
          // d'écran annonce alors ce qui va se passer si on active le bouton.
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted transition hover:text-body focus-visible:text-brand-600"
        >
          {visible ? <IconEyeOff className="size-4.5" /> : <IconEye className="size-4.5" />}
        </button>
      </div>
    </Field>
  );
}
