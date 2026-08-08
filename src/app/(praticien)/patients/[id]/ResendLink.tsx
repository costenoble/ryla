"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconLink, IconLock } from "@/components/icons";
import { Button, cx, inputClass } from "@/components/ui";
import { resendDocumentLink, type ResendState } from "@/lib/actions/documents";

const initial: ResendState = { status: "idle" };

/**
 * Renvoi du lien d'un document.
 *
 * Le lien n'apparaît que dans la réponse de l'action, jamais dans l'URL : un
 * jeton dans la barre d'adresse finit dans l'historique du navigateur et dans
 * les journaux des intermédiaires.
 */
export function ResendLink({ submissionId }: { submissionId: string }) {
  const [state, formAction, pending] = useActionState(resendDocumentLink, initial);
  const [copied, setCopied] = useState(false);

  if (state.status === "sent") {
    const expires = new Date(state.expiresAt).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    });

    return (
      <div className="mt-3 rounded-lg border border-emerald-100 bg-positive-soft p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-positive">
          <IconCheck className="size-4" />
          Nouveau lien créé — valable jusqu'au {expires}
        </p>
        <p className="mt-1 text-xs text-positive/90">
          Le lien précédent est désactivé : un seul lien reste valide à la fois.
        </p>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Lien à transmettre au patient"
            className={cx(inputClass, "font-mono text-xs")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
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
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <IconLock className="mt-0.5 size-3 shrink-0" />
          Ce lien ne contient aucune donnée de santé.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <IconLink className="size-3.5" />
        {pending ? "Création…" : "Renvoyer le lien"}
      </Button>
      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <IconAlert className="mt-0.5 size-3.5 shrink-0" />
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
