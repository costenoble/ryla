"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { IconAlert, IconCheck, IconClock } from "@/components/icons";
import { Button } from "@/components/ui";
import {
  acceptQuoteAction,
  deliverQuoteAction,
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
  const [deliverState, deliver, delivering] = useActionState(deliverQuoteAction, initial);
  const [acceptState, accept, accepting] = useActionState(acceptQuoteAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (deliverState.status === "delivered" || acceptState.status === "accepted") {
      router.refresh();
    }
  }, [deliverState, acceptState, router]);

  const error =
    deliverState.status === "error"
      ? deliverState.message
      : acceptState.status === "error"
        ? acceptState.message
        : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "draft" ? (
          <form action={deliver}>
            <input type="hidden" name="quoteId" value={quoteId} />
            <Button type="submit" disabled={delivering}>
              {delivering ? "Remise…" : "Remettre au patient"}
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
