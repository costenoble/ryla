"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { Badge, Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import {
  deleteNomenclatureEntry,
  saveNomenclatureEntry,
  type ActState,
} from "@/lib/actions/nomenclature";
import { CARE_BASKET_LABELS, formatCents } from "@/lib/cerfa";
import { matchNomenclature, type NomenclatureEntry } from "@/lib/repos/nomenclature";

const idle: ActState = { status: "idle" };

/**
 * Gestion du référentiel d'actes.
 *
 * Deux natures de lignes, et la distinction est visible en permanence : les
 * actes du cabinet, qu'il modifie et supprime, et la référence partagée, en
 * lecture seule. Corriger un acte partagé le duplique — sa version prime
 * ensuite à la recherche, sans que la référence bouge pour les autres.
 */
export function ActsManager({ entries }: { entries: NomenclatureEntry[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<NomenclatureEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => matchNomenclature(entries, query, 200), [entries, query]);
  const owned = entries.filter((entry) => entry.tenantId).length;

  return (
    <div className="space-y-6">
      {editing || creating ? (
        <ActForm
          entry={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      ) : null}

      <Card>
        <CardHeader
          title="Référentiel d'actes"
          subtitle={`${entries.length} actes disponibles, dont ${owned} propres à votre cabinet.`}
          action={
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              Ajouter un acte
            </Button>
          }
        />

        <div className="border-b border-line p-5">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrer par code ou par libellé…"
            aria-label="Filtrer les actes"
            className={inputClass}
          />
        </div>

        <ul className="divide-y divide-line">
          {visible.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular text-sm font-bold text-brand-700">
                    {entry.code}
                  </span>
                  <Badge tone="neutral">{entry.system}</Badge>
                  {entry.tenantId ? (
                    <Badge tone="brand">Votre version</Badge>
                  ) : (
                    <Badge tone="neutral">Référence</Badge>
                  )}
                  {!entry.reimbursable ? (
                    <Badge tone="caution">Non remboursable</Badge>
                  ) : null}
                  {entry.needsReview ? <Badge tone="caution">Tarif à vérifier</Badge> : null}
                </div>

                <p className="mt-1 text-sm text-body">{entry.shortLabel ?? entry.label}</p>

                <p className="tabular mt-0.5 text-xs text-muted">
                  {entry.baseReimbursementCents !== null
                    ? `Base ${formatCents(entry.baseReimbursementCents)} · ${Math.round(entry.reimbursementRate * 100)} %`
                    : "Base de remboursement non renseignée"}
                  {entry.ngapCoefficient
                    ? ` · ${entry.ngapKey ?? "NGAP"} ${entry.ngapCoefficient}`
                    : ""}
                  {entry.careBasket ? ` · ${CARE_BASKET_LABELS[entry.careBasket]}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreating(false);
                    setEditing(entry);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {entry.tenantId ? "Modifier" : "Corriger"}
                </Button>
                {entry.tenantId ? <DeleteButton entryId={entry.id} /> : null}
              </div>
            </li>
          ))}

          {visible.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted">
              Aucun acte ne correspond. Vous pouvez en créer un.
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActForm({
  entry,
  onClose,
}: {
  entry: NomenclatureEntry | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveNomenclatureEntry, idle);

  useEffect(() => {
    if (state.status === "saved") {
      onClose();
      // Rechargement plutôt que rafraîchissement partiel : le catalogue est
      // chargé d'un bloc par la page et sert aussi à l'éditeur de devis.
      window.location.reload();
    }
  }, [state, onClose]);

  // Corriger une référence partagée ne la modifie pas : on en crée une copie
  // qui appartient au cabinet. D'où l'absence d'identifiant transmis.
  const isCopy = entry !== null && entry.tenantId === null;

  return (
    <Card>
      <CardHeader
        title={
          entry === null
            ? "Nouvel acte"
            : isCopy
              ? `Corriger ${entry.code}`
              : `Modifier ${entry.code}`
        }
        subtitle={
          isCopy
            ? "La référence partagée n'est pas touchée : votre version sera créée à côté et primera à la recherche."
            : undefined
        }
      />
      <form action={action}>
        {entry && !isCopy ? (
          <input type="hidden" name="entryId" value={entry.id} />
        ) : null}

        <div className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Système" htmlFor="system" required>
              <select
                id="system"
                name="system"
                defaultValue={entry?.system ?? "CCAM"}
                className={inputClass}
              >
                <option value="CCAM">CCAM</option>
                <option value="NGAP">NGAP</option>
                <option value="HORS_NOMENCLATURE">Hors nomenclature</option>
              </select>
            </Field>
            <Field label="Code" htmlFor="code" required>
              <input
                id="code"
                name="code"
                required
                defaultValue={entry?.code ?? ""}
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field label="Spécialité" htmlFor="specialty">
              <select
                id="specialty"
                name="specialty"
                defaultValue={entry?.specialty ?? "commun"}
                className={inputClass}
              >
                <option value="dentaire">Dentaire</option>
                <option value="esthetique">Esthétique</option>
                <option value="commun">Commun</option>
              </select>
            </Field>
          </div>

          <Field label="Libellé complet" htmlFor="label" required>
            <input
              id="label"
              name="label"
              required
              defaultValue={entry?.label ?? ""}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Libellé court"
              htmlFor="shortLabel"
              hint="Affiché dans la liste de saisie du devis."
            >
              <input
                id="shortLabel"
                name="shortLabel"
                defaultValue={entry?.shortLabel ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Catégorie" htmlFor="category">
              <input
                id="category"
                name="category"
                placeholder="prothese, conservateur, chirurgie…"
                defaultValue={entry?.category ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="Base de remboursement €"
              htmlFor="base"
              hint="Vide si inconnue — jamais zéro."
            >
              <input
                id="base"
                name="base"
                inputMode="decimal"
                defaultValue={
                  entry?.baseReimbursementCents !== null && entry !== null
                    ? (entry.baseReimbursementCents! / 100).toFixed(2)
                    : ""
                }
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field label="Taux AMO" htmlFor="rate" hint="0,70 pour la plupart des actes.">
              <input
                id="rate"
                name="rate"
                inputMode="decimal"
                defaultValue={String(entry?.reimbursementRate ?? 0.7)}
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field
              label="Honoraire limite €"
              htmlFor="ceiling"
              hint="Plafond opposable, si applicable."
            >
              <input
                id="ceiling"
                name="ceiling"
                inputMode="decimal"
                defaultValue={
                  entry?.ceilingCents != null ? (entry.ceilingCents / 100).toFixed(2) : ""
                }
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Panier de soins" htmlFor="careBasket">
              <select
                id="careBasket"
                name="careBasket"
                defaultValue={entry?.careBasket ?? ""}
                className={inputClass}
              >
                <option value="">Aucun par défaut</option>
                {Object.entries(CARE_BASKET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Coefficient NGAP"
              htmlFor="coefficient"
              hint="Le montant vaut coefficient × valeur de la lettre-clé."
            >
              <input
                id="coefficient"
                name="coefficient"
                inputMode="decimal"
                defaultValue={entry?.ngapCoefficient ?? ""}
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-body">
            <input
              type="checkbox"
              name="reimbursable"
              defaultChecked={entry?.reimbursable ?? true}
              className="size-4"
            />
            Acte remboursable par l'assurance maladie
          </label>

          <Field label="Notes" htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={entry?.notes ?? ""}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : isCopy ? "Créer ma version" : "Enregistrer"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-muted transition hover:text-body"
            >
              Annuler
            </button>
            {state.status === "error" ? (
              <span
                role="alert"
                className="flex items-start gap-1.5 text-sm font-semibold text-danger"
              >
                <IconAlert className="mt-0.5 size-4 shrink-0" />
                {state.message}
              </span>
            ) : null}
          </div>
        </div>
      </form>
    </Card>
  );
}

function DeleteButton({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(deleteNomenclatureEntry, idle);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.status === "deleted") window.location.reload();
  }, [state]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Supprimer
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="entryId" value={entryId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "…" : "Confirmer"}
      </Button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs font-medium text-muted transition hover:text-body"
      >
        Non
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs font-semibold text-danger">
          <IconAlert className="inline size-3.5" /> {state.message}
        </span>
      ) : null}
      {state.status === "deleted" ? <IconCheck className="size-4 text-positive" /> : null}
    </form>
  );
}
