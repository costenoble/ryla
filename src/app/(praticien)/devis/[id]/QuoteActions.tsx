"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { IconAlert, IconCheck, IconClock } from "@/components/icons";
import { Button } from "@/components/ui";
import {
  acceptQuoteAction,
  deliverQuoteAction,
  sendQuoteForSignature,
  type QuoteActionState,
} from "@/lib/actions/quotes";

const initial: QuoteActionState = { status: "idle" };

/**
 * Remise et acceptation d'un devis.
 *
 * Le bouton d'acceptation disparaît pendant le délai de réflexion, mais ce
 * n'est pas lui qui protège : `acceptQuote()` refuse côté serveur tant que le
 * délai court. L'interface informe, le serveur décide.
 */
export function QuoteActions({
  quoteId,
  status,
  reflectionElapsed,
  reflectionRequired,
}: {
  quoteId: string;
  status: string;
  reflectionElapsed: boolean;
  reflectionRequired: boolean;
}) {
  const [sendState, send, sending] = useActionState(sendQuoteForSignature, initial);
  const [deliverState, deliver, delivering] = useActionState(deliverQuoteAction, initial);
  const [acceptState, accept, accepting] = useActionState(acceptQuoteAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (
      deliverState.status === "delivered" ||
      acceptState.status === "accepted" ||
      sendState.status === "sent"
    ) {
      router.refresh();
    }
  }, [deliverState, acceptState, sendState, router]);

  const error =
    deliverState.status === "error"
      ? deliverState.message
      : acceptState.status === "error"
        ? acceptState.message
        : sendState.status === "error"
          ? sendState.message
          : null;

  return (
    <div className="space-y-3">
      {/* L'envoi au patient est l'action principale : elle produit le PDF,
          l'attache à un dossier de signature et lance le délai de réflexion.
          La remise sans envoi reste possible pour un devis remis en main
          propre. */}
      {status === "draft" || status === "sent" ? (
        <form action={send}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <Button type="submit" disabled={sending}>
            {sending ? "Envoi…" : "Envoyer au patient pour signature"}
          </Button>
        </form>
      ) : null}

      {sendState.status === "sent" ? (
        <div className="rounded-xl bg-positive-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-positive">
            <IconCheck className="size-4" />
            {sendState.emailedTo
              ? `Devis envoyé à ${sendState.emailedTo}`
              : "Devis prêt — lien à transmettre"}
          </p>
          {sendState.deliveryError ? (
            <p className="mt-1 text-xs font-semibold text-caution">
              L'email n'est pas parti : transmettez le lien ci-dessous vous-même.
            </p>
          ) : null}
          <input
            readOnly
            value={sendState.url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Lien de signature"
            className="mt-2 w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-xs"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status === "draft" ? (
          <form action={deliver}>
            <input type="hidden" name="quoteId" value={quoteId} />
            <Button type="submit" variant="outline" disabled={delivering}>
              {delivering ? "Remise…" : "Remis en main propre"}
            </Button>
          </form>
        ) : null}

        {status === "sent" && (!reflectionRequired || reflectionElapsed) ? (
          <form action={accept}>
            <input type="hidden" name="quoteId" value={quoteId} />
            <Button type="submit" variant="outline" disabled={accepting}>
              {accepting ? "Enregistrement…" : "Marquer comme accepté"}
            </Button>
          </form>
        ) : null}

        {status === "sent" && reflectionRequired && !reflectionElapsed ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-caution">
            <IconClock className="size-4" />
            Acceptation impossible pendant le délai de réflexion
          </span>
        ) : null}

        {status === "accepted" ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-positive">
            <IconCheck className="size-4" />
            Devis accepté
          </span>
        ) : null}
      </div>

      {status === "draft" && reflectionRequired ? (
        <p className="text-xs leading-relaxed text-muted">
          La remise est irréversible : c'est elle qui fait courir le délai de
          réflexion, horodaté par la base et non modifiable ensuite.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
