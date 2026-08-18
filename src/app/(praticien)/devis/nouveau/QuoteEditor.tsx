"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { IconAlert, IconReceipt } from "@/components/icons";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { createQuoteDraft, type QuoteFormState } from "@/lib/actions/quotes";
import {
  CARE_BASKET_LABELS,
  computeQuoteTotals,
  formatCents,
  type CareBasket,
  type QuoteLineInput,
} from "@/lib/cerfa";
import { matchNomenclature, type NomenclatureEntry } from "@/lib/repos/nomenclature";
import { REFLECTION_DAYS_ESTHETIQUE } from "@/lib/reflection";

const initial: QuoteFormState = { status: "idle" };

export type QuotePatient = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
};

export type QuoteContext = {
  tenantName: string;
  specialty: "dentaire" | "esthetique" | "mixte";
  letterheadMode: "none" | "text" | "image";
  letterheadText: string;
  hasLetterheadImage: boolean;
  primaryColor: string;
  practitionerName: string;
  practitionerIdentifier: string | null;
  practiceAddress: string | null;
  nomenclature: NomenclatureEntry[];
  /** Nombre d'actes du référentiel encore dépourvus de tarif officiel. */
  withoutTariff: number;
};

type DraftLine = {
  key: string;
  code: string;
  description: string;
  teeth: string;
  material: string;
  careBasket: CareBasket | "";
  quantity: number;
  /** Saisis en euros — convertis en centimes au moment d'enregistrer. */
  honoraires: string;
  base: string;
  rate: string;
  amc: string;
};

let sequence = 0;
const nextKey = (): string => `line-${(sequence += 1)}`;

function euros(value: string): number {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function toInput(line: DraftLine): QuoteLineInput {
  return {
    description: line.description.trim(),
    ccamCode: line.code.trim() || null,
    toothNumbers: line.teeth.trim()
      ? line.teeth.split(/[\s,]+/).filter(Boolean).slice(0, 32)
      : null,
    careBasket: line.careBasket || null,
    material: line.material.trim() || null,
    quantity: Math.max(1, line.quantity),
    unitPriceCents: euros(line.honoraires),
    baseReimbursementCents: euros(line.base),
    reimbursementRate: Number(line.rate) || 0,
    amcCents: euros(line.amc),
  };
}

export function QuoteEditor({
  context,
  patients,
  initialPatientId,
}: {
  context: QuoteContext;
  patients: QuotePatient[];
  initialPatientId: string | null;
}) {
  const [state, formAction, pending] = useActionState(createQuoteDraft, initial);
  const router = useRouter();

  const [kind, setKind] = useState<"dentaire_cerfa_s3404" | "esthetique">(
    context.specialty === "esthetique" ? "esthetique" : "dentaire_cerfa_s3404",
  );
  const [patientId, setPatientId] = useState(initialPatientId ?? "");
  const [validityDays, setValidityDays] = useState(30);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (state.status === "created") router.push(`/devis/${state.quoteId}`);
  }, [state, router]);

  const suggestions = useMemo(
    () => (query.trim() === "" ? [] : matchNomenclature(context.nomenclature, query, 8)),
    [context.nomenclature, query],
  );

  const totals = useMemo(() => computeQuoteTotals(lines.map(toInput)), [lines]);
  const patient = patients.find((candidate) => candidate.id === patientId) ?? null;

  const addFromNomenclature = (entry: NomenclatureEntry) => {
    setLines((previous) => [
      ...previous,
      {
        key: nextKey(),
        code: entry.code,
        description: entry.label,
        teeth: "",
        material: "",
        careBasket: entry.careBasket ?? "",
        quantity: 1,
        honoraires: "",
        // Préremplie quand le référentiel la connaît ; vide sinon, plutôt
        // qu'un zéro qui se recopierait tel quel sur un devis opposable.
        base:
          entry.baseReimbursementCents !== null
            ? (entry.baseReimbursementCents / 100).toFixed(2)
            : "",
        rate: entry.reimbursable ? String(entry.reimbursementRate) : "0",
        amc: "",
      },
    ]);
    setQuery("");
  };

  const addBlank = () => {
    setLines((previous) => [
      ...previous,
      {
        key: nextKey(),
        code: "",
        description: "",
        teeth: "",
        material: "",
        careBasket: "",
        quantity: 1,
        honoraires: "",
        base: "",
        rate: kind === "esthetique" ? "0" : "0.7",
        amc: "",
      },
    ]);
  };

  const patch = (key: string, changes: Partial<DraftLine>) =>
    setLines((previous) =>
      previous.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );

  const remove = (key: string) =>
    setLines((previous) => previous.filter((line) => line.key !== key));

  const payload = JSON.stringify({
    kind,
    patientId: patientId || null,
    validityDays,
    note,
    lines: lines.map(toInput),
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Nature du devis" />
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["dentaire_cerfa_s3404", "Dentaire — CERFA S3404"],
                  ["esthetique", "Chirurgie esthétique"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    kind === value
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {kind === "esthetique" ? (
              <p className="rounded-md bg-caution-soft px-3.5 py-3 text-xs leading-relaxed text-caution">
                Un délai de réflexion de {REFLECTION_DAYS_ESTHETIQUE} jours
                s'appliquera à partir de la remise du devis (art. D6322-30 CSP). Il
                n'est pas dérogeable, même à la demande du patient, et l'acceptation
                sera refusée tant qu'il court.
              </p>
            ) : (
              <p className="rounded-md bg-brand-50 px-3.5 py-3 text-xs leading-relaxed text-brand-700">
                Devis conventionnel obligatoire : code CCAM, panier de soins et base
                de remboursement sont contrôlés avant enregistrement.
              </p>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Patient" htmlFor="patient" required>
                <select
                  id="patient"
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choisir un patient…</option>
                  {patients.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.lastName} {candidate.firstName}
                      {candidate.birthDate ? ` — ${candidate.birthDate}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Validité (jours)" htmlFor="validity">
                <input
                  id="validity"
                  type="number"
                  min={1}
                  max={365}
                  value={validityDays}
                  onChange={(event) => setValidityDays(Number(event.target.value) || 30)}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Actes"
            subtitle="Cherchez un code CCAM ou un libellé, ou ajoutez une ligne libre."
          />
          <div className="p-5">
            <div className="relative">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex. « couronne céramo », « HBLD038 », « SPR »…"
                className={inputClass}
                aria-label="Rechercher un acte"
              />
              {suggestions.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-card">
                  {suggestions.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => addFromNomenclature(entry)}
                        className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-canvas"
                      >
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="tabular text-xs font-bold text-brand-700">
                            {entry.code}
                          </span>
                          <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                            {entry.system}
                          </span>
                          {!entry.reimbursable ? (
                            <span className="rounded bg-caution-soft px-1.5 py-0.5 text-[10px] font-semibold text-caution">
                              non remboursable
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-sm text-body">
                          {entry.shortLabel ?? entry.label}
                        </span>
                        {entry.notes ? (
                          <span className="mt-0.5 block text-xs text-muted">
                            {entry.notes}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {context.withoutTariff > 0 ? (
              <p className="mt-3 rounded-md bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                {context.withoutTariff} acte(s) du référentiel n'ont pas encore de
                tarif officiel : la base de remboursement est à saisir. Elle se
                préremplira après l'import de la base conventionnelle.
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              {lines.map((line, index) => (
                <LineRow
                  key={line.key}
                  line={line}
                  index={index}
                  kind={kind}
                  onChange={(changes) => patch(line.key, changes)}
                  onRemove={() => remove(line.key)}
                />
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addBlank} className="mt-4">
              Ajouter une ligne libre
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Note au patient" subtitle="Facultative, reprise sur le devis." />
          <div className="p-5">
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
              aria-label="Note au patient"
            />
          </div>
        </Card>

        <form action={formAction}>
          <input type="hidden" name="payload" value={payload} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={pending || lines.length === 0 || !patientId}>
              {pending ? "Enregistrement…" : "Enregistrer le devis"}
            </Button>
            <span className="text-sm text-muted">
              Il sera créé en brouillon — la remise au patient est une action
              distincte{kind === "esthetique" ? ", c'est elle qui lance le délai" : ""}.
            </span>
          </div>

          {state.status === "error" ? (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <p className="flex items-center gap-2 font-semibold">
                <IconAlert className="size-4" />
                {state.message}
              </p>
              {state.issues && state.issues.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {state.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <QuotePreview
          context={context}
          kind={kind}
          patient={patient}
          lines={lines}
          totals={totals}
          validityDays={validityDays}
          note={note}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LineRow({
  line,
  index,
  kind,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  kind: string;
  onChange: (changes: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const computed = computeQuoteTotals([toInput(line)]);

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-faint">Ligne {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-muted transition hover:text-danger"
        >
          Retirer
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <Field label="Code" htmlFor={`${line.key}-code`}>
          <input
            id={`${line.key}-code`}
            value={line.code}
            onChange={(event) => onChange({ code: event.target.value })}
            className={`${inputClass} tabular text-sm`}
          />
        </Field>
        <Field label="Désignation" htmlFor={`${line.key}-desc`}>
          <input
            id={`${line.key}-desc`}
            value={line.description}
            onChange={(event) => onChange({ description: event.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      {kind === "dentaire_cerfa_s3404" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Dents" htmlFor={`${line.key}-teeth`} hint="Ex. 16 17">
            <input
              id={`${line.key}-teeth`}
              value={line.teeth}
              onChange={(event) => onChange({ teeth: event.target.value })}
              className={`${inputClass} tabular text-sm`}
            />
          </Field>
          <Field label="Matériau" htmlFor={`${line.key}-material`}>
            <input
              id={`${line.key}-material`}
              value={line.material}
              onChange={(event) => onChange({ material: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Panier de soins" htmlFor={`${line.key}-basket`}>
            <select
              id={`${line.key}-basket`}
              value={line.careBasket}
              onChange={(event) =>
                onChange({ careBasket: event.target.value as CareBasket | "" })
              }
              className={inputClass}
            >
              <option value="">À préciser</option>
              {Object.entries(CARE_BASKET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <Field label="Qté" htmlFor={`${line.key}-qty`}>
          <input
            id={`${line.key}-qty`}
            type="number"
            min={1}
            value={line.quantity}
            onChange={(event) => onChange({ quantity: Number(event.target.value) || 1 })}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Honoraires €" htmlFor={`${line.key}-fee`}>
          <input
            id={`${line.key}-fee`}
            inputMode="decimal"
            value={line.honoraires}
            onChange={(event) => onChange({ honoraires: event.target.value })}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Base rembt €" htmlFor={`${line.key}-base`}>
          <input
            id={`${line.key}-base`}
            inputMode="decimal"
            value={line.base}
            onChange={(event) => onChange({ base: event.target.value })}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Taux AMO" htmlFor={`${line.key}-rate`}>
          <input
            id={`${line.key}-rate`}
            inputMode="decimal"
            value={line.rate}
            onChange={(event) => onChange({ rate: event.target.value })}
            className={`${inputClass} tabular`}
          />
        </Field>
        <Field label="Part AMC €" htmlFor={`${line.key}-amc`} hint="Si connue">
          <input
            id={`${line.key}-amc`}
            inputMode="decimal"
            value={line.amc}
            onChange={(event) => onChange({ amc: event.target.value })}
            className={`${inputClass} tabular`}
          />
        </Field>
      </div>

      <p className="tabular mt-3 text-xs text-muted">
        Reste à charge de la ligne :{" "}
        <span className="font-bold text-flame-700">
          {formatCents(computed.remainingChargeCents)}
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuotePreview({
  context,
  kind,
  patient,
  lines,
  totals,
  validityDays,
  note,
}: {
  context: QuoteContext;
  kind: string;
  patient: QuotePatient | null;
  lines: DraftLine[];
  totals: ReturnType<typeof computeQuoteTotals>;
  validityDays: number;
  note: string;
}) {
  const today = new Date().toLocaleDateString("fr-FR");

  return (
    <Card>
      <CardHeader
        title="Aperçu"
        subtitle="Ce que le patient recevra, mis à jour à la saisie."
      />
      <div className="p-5">
        <div className="rounded-lg border border-line bg-white p-5 text-[11px] leading-relaxed shadow-tile">
          <div
            className="h-1 w-full rounded-full"
            style={{ background: context.primaryColor }}
          />

          <div className="mt-3 min-h-[56px]">
            {context.letterheadMode === "image" && context.hasLetterheadImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/api/branding/letterhead"
                alt="En-tête du cabinet"
                className="max-h-20 w-full object-contain object-left"
              />
            ) : context.letterheadMode === "text" && context.letterheadText.trim() ? (
              <p className="whitespace-pre-line text-body">{context.letterheadText}</p>
            ) : (
              <p className="font-bold text-body">{context.tenantName}</p>
            )}
          </div>

          <div className="mt-3 flex items-start justify-between gap-3 border-t border-line pt-3">
            <div>
              <p className="text-[13px] font-bold text-body">
                {kind === "esthetique"
                  ? "DEVIS — CHIRURGIE ESTHÉTIQUE"
                  : "DEVIS CONVENTIONNEL DENTAIRE"}
              </p>
              <p className="mt-0.5 text-faint">
                {kind === "dentaire_cerfa_s3404" ? "Conforme CERFA S3404 · " : ""}
                établi le {today} · valable {validityDays} jours
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <p className="font-semibold text-faint">Praticien</p>
              <p className="text-body">{context.practitionerName}</p>
              {context.practitionerIdentifier ? (
                <p className="text-faint">RPPS {context.practitionerIdentifier}</p>
              ) : (
                <p className="text-flame-700">RPPS manquant</p>
              )}
              {context.practiceAddress ? (
                <p className="text-faint">{context.practiceAddress}</p>
              ) : (
                <p className="text-flame-700">Adresse du cabinet manquante</p>
              )}
            </div>
            <div>
              <p className="font-semibold text-faint">Patient</p>
              {patient ? (
                <>
                  <p className="text-body">
                    {patient.lastName} {patient.firstName}
                  </p>
                  <p className="text-faint">
                    {patient.birthDate ? `Né(e) le ${patient.birthDate}` : "Date de naissance manquante"}
                  </p>
                </>
              ) : (
                <p className="text-flame-700">Aucun patient sélectionné</p>
              )}
            </div>
          </div>

          <table className="mt-3 w-full border-t border-line pt-3 text-left">
            <thead>
              <tr className="text-[10px] text-faint">
                <th className="py-1 font-semibold">Code</th>
                <th className="py-1 font-semibold">Acte</th>
                <th className="py-1 text-right font-semibold">Honoraires</th>
                <th className="py-1 text-right font-semibold">RAC</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-faint">
                    Aucun acte pour l'instant.
                  </td>
                </tr>
              ) : (
                totals.lines.map((line, index) => (
                  <tr key={index} className="border-t border-line/60 align-top">
                    <td className="tabular py-1.5 pr-2 text-faint">{line.ccamCode ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-body">
                      {line.description || "Désignation à compléter"}
                      {line.toothNumbers?.length ? (
                        <span className="tabular text-faint"> · {line.toothNumbers.join(" ")}</span>
                      ) : null}
                      {line.quantity > 1 ? (
                        <span className="text-faint"> · ×{line.quantity}</span>
                      ) : null}
                    </td>
                    <td className="tabular py-1.5 text-right text-body">
                      {formatCents(line.grossCents)}
                    </td>
                    <td className="tabular py-1.5 text-right font-semibold text-body">
                      {formatCents(line.patientCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mt-3 space-y-1 border-t border-line pt-3">
            <Row label="Total honoraires" value={formatCents(totals.totalAmountCents)} />
            <Row label="Part assurance maladie" value={formatCents(totals.totalAmoCents)} />
            <Row label="Part complémentaire" value={formatCents(totals.totalAmcCents)} />
            <div className="flex justify-between border-t border-line pt-1.5 text-[13px] font-bold">
              <span className="text-body">Reste à votre charge</span>
              <span className="tabular text-flame-700">
                {formatCents(totals.remainingChargeCents)}
              </span>
            </div>
          </div>

          {note.trim() ? (
            <p className="mt-3 border-t border-line pt-3 whitespace-pre-line text-faint">
              {note}
            </p>
          ) : null}

          {kind === "esthetique" ? (
            <p className="mt-3 border-t border-line pt-3 text-faint">
              Un délai de réflexion de {REFLECTION_DAYS_ESTHETIQUE} jours court à
              compter de la remise du présent devis (art. D6322-30 du code de la santé
              publique). Aucune intervention ne peut être programmée avant son terme.
            </p>
          ) : null}
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <IconReceipt className="mt-0.5 size-3.5 shrink-0" />
          L'aperçu reprend l'en-tête défini dans les réglages du cabinet.
        </p>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-faint">{label}</span>
      <span className="tabular text-body">{value}</span>
    </div>
  );
}
