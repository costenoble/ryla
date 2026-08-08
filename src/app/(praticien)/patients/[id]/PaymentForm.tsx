"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { Badge, Button, cx, inputClass, type BadgeTone } from "@/components/ui";
import { saveQuotePayment, type PaymentFormState } from "@/lib/actions/patients";

const initial: PaymentFormState = { status: "idle" };

const LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Non réglé", tone: "caution" },
  partial: { label: "Réglé en partie", tone: "brand" },
  paid: { label: "Réglé", tone: "positive" },
  waived: { label: "Sans reste à charge", tone: "neutral" },
};

/**
 * Saisie manuelle d'un règlement.
 *
 * Rien n'est encaissé ici : le cabinet note ce qu'il a reçu. Le libellé le dit
 * explicitement, pour qu'aucun praticien ne croie qu'un paiement en ligne a
 * eu lieu.
 */
export function PaymentForm({
  quoteId,
  paymentStatus,
  paidAmountCents,
  remainingChargeCents,
  paymentNote,
}: {
  quoteId: string;
  paymentStatus: string;
  paidAmountCents: number;
  remainingChargeCents: number;
  paymentNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveQuotePayment, initial);
  const [open, setOpen] = useState(false);
  const current = LABELS[paymentStatus] ?? LABELS.unpaid!;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone={state.status === "saved" ? "positive" : current.tone}>
          {state.status === "saved" ? (
            <>
              <IconCheck className="size-3.5" />
              Enregistré
            </>
          ) : (
            current.label
          )}
        </Badge>
        {paidAmountCents > 0 ? (
          <span className="tabular text-xs text-muted">
            {(paidAmountCents / 100).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            reçus
          </span>
        ) : null}
        {paymentNote ? (
          <span className="text-xs text-faint italic">{paymentNote}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-xs font-semibold text-brand-600 underline underline-offset-2 transition hover:text-brand-700"
        >
          Noter un règlement
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-line bg-canvas/60 p-3.5">
      <input type="hidden" name="quoteId" value={quoteId} />
      <p className="mb-3 text-xs text-muted">
        Saisie manuelle — aucun encaissement n'est effectué par Ryla.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-body">Statut</span>
          <select
            name="paymentStatus"
            defaultValue={paymentStatus}
            className={cx(inputClass, "py-2 text-sm")}
          >
            <option value="unpaid">Non réglé</option>
            <option value="partial">Réglé en partie</option>
            <option value="paid">Réglé</option>
            <option value="waived">Sans reste à charge</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-body">
            Montant reçu (€)
          </span>
          <input
            name="paidAmount"
            type="number"
            step="0.01"
            min="0"
            max={(remainingChargeCents / 100).toFixed(2)}
            defaultValue={(paidAmountCents / 100).toFixed(2)}
            className={cx(inputClass, "py-2 text-sm")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-body">Note</span>
          <input
            name="paymentNote"
            defaultValue={paymentNote ?? ""}
            placeholder="Chèque, CB, acompte…"
            className={cx(inputClass, "py-2 text-sm")}
          />
        </label>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-danger">
          <IconAlert className="mt-0.5 size-3.5 shrink-0" />
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer text-xs font-medium text-muted transition hover:text-body"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
