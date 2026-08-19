"use client";

import { useActionState, useEffect, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { Letterhead } from "@/components/Letterhead";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import {
  saveLetterhead,
  saveLetterheadLayout,
  savePractitioner,
  saveTenantSettings,
  type LetterheadState,
  type PractitionerState,
  type SettingsState,
} from "@/lib/actions/tenant";
import type { TenantSelf } from "@/lib/repos/tenants";
import { letterheadBlocks as readBlocks, type LetterheadBlock } from "@/lib/letterhead";

/**
 * Réglages du cabinet.
 *
 * Trois formulaires **côte à côte**, jamais imbriqués : un `<form>` dans un
 * `<form>` est invalide, et le navigateur supprime silencieusement l'intérieur
 * — le bouton d'envoi de l'image soumettait en réalité le formulaire des
 * réglages. Rien ne le signalait, ni à la compilation ni à l'exécution.
 *
 * L'aperçu d'en-tête se met à jour à la frappe : c'est le seul endroit du
 * produit où le praticien décide de ce qui sera imprimé en tête de ses devis,
 * et il doit le voir avant d'enregistrer — pas après l'avoir envoyé à un
 * patient.
 */

export type PractitionerValues = {
  fullName: string;
  rpps: string | null;
  specialityLabel: string | null;
};

const idleSettings: SettingsState = { status: "idle" };
const idleLetterhead: LetterheadState = { status: "idle" };
const idlePractitioner: PractitionerState = { status: "idle" };

export function SettingsForm({
  tenant,
  practitioner,
}: {
  tenant: TenantSelf;
  practitioner: PractitionerValues;
}) {
  const [mode, setMode] = useState(tenant.branding.letterheadMode ?? "none");
  const [blocks, setBlocks] = useState<LetterheadBlock[]>(() => {
    const existing = readBlocks(tenant.branding);
    return existing.length > 0 ? existing : defaultLetterhead(tenant);
  });
  const [primary, setPrimary] = useState(tenant.branding.primaryColor ?? "#2563EB");

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <PractitionerCard values={practitioner} />

        {/* L'en-tête a son propre formulaire : deux formulaires ne s'imbriquent
            pas, et c'est la seule façon que l'envoi de l'image s'affiche juste
            en dessous plutôt qu'en bas de page. */}
        <LetterheadCard
          mode={mode}
          onMode={setMode}
          blocks={blocks}
          onBlocks={setBlocks}
        />

        {mode === "image" ? (
          <LetterheadUpload hasImage={Boolean(tenant.branding.letterheadImageKey)} />
        ) : null}

        <TenantCard tenant={tenant} primary={primary} onPrimary={setPrimary} />
      </div>

      <div className="min-w-0 xl:sticky xl:top-6">
        <LetterheadPreview
          mode={mode}
          blocks={blocks}
          primary={primary}
          hasImage={Boolean(tenant.branding.letterheadImageKey)}
          practitioner={practitioner}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PractitionerCard({ values }: { values: PractitionerValues }) {
  const [state, action, pending] = useActionState(savePractitioner, idlePractitioner);
  const missingRpps = !values.rpps;

  return (
    <form action={action}>
      <Card>
        <CardHeader
          title="Votre fiche praticien"
          subtitle="Reprise sur les devis et les documents signés."
        />
        <div className="space-y-5 p-5">
          {missingRpps ? (
            <p className="rounded-md bg-caution-soft px-3.5 py-3 text-sm leading-relaxed text-caution">
              <span className="font-semibold">Identifiant manquant.</span> Le devis
              conventionnel dentaire l'exige (arrêté du 31 octobre 2020) : sans lui,
              l'enregistrement d'un devis est refusé.
            </p>
          ) : null}

          <Field label="Nom affiché" htmlFor="fullName" required>
            <input
              id="fullName"
              name="fullName"
              required
              defaultValue={values.fullName}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Identifiant RPPS ou ADELI"
              htmlFor="rpps"
              hint="11 chiffres pour un RPPS, 9 pour un ADELI."
            >
              <input
                id="rpps"
                name="rpps"
                inputMode="numeric"
                defaultValue={values.rpps ?? ""}
                placeholder="10001234567"
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field label="Spécialité affichée" htmlFor="specialityLabel">
              <input
                id="specialityLabel"
                name="specialityLabel"
                defaultValue={values.specialityLabel ?? ""}
                placeholder="Chirurgien-dentiste"
                className={inputClass}
              />
            </Field>
          </div>

          <FormFooter
            pending={pending}
            label="Enregistrer ma fiche"
            saved={state.status === "saved"}
            error={state.status === "error" ? state.message : null}
          />
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------

function TenantCard({
  tenant,
  primary,
  onPrimary,
}: {
  tenant: TenantSelf;
  primary: string;
  onPrimary: (value: string) => void;
}) {
  const [state, action, pending] = useActionState(saveTenantSettings, idleSettings);

  // Un seul `onChange` sur le formulaire : les évènements des champs remontent,
  // y compris ceux des composants contrôlés de l'éditeur d'en-tête. Suivre
  // chaque champ séparément aurait laissé passer celui qu'on aurait oublié.
  const [dirty, setDirty] = useState(false);
  const saved = state.status === "saved";

  useEffect(() => {
    if (saved) setDirty(false);
  }, [saved]);

  // Composer un en-tête prend du temps, et le perdre en changeant d'onglet est
  // une déception qu'on n'a pas le droit d'infliger deux fois.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form
      action={action}
      onChange={() => setDirty(true)}
      className="space-y-6 pb-20"
    >
      <Card>
        <CardHeader
          title="Identité du cabinet"
          subtitle="Ces mentions figurent sur les devis et les documents signés."
        />
        <div className="space-y-5 p-5">
          <Field label="Nom du cabinet" htmlFor="name" required>
            <input
              id="name"
              name="name"
              required
              defaultValue={tenant.name}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Raison sociale" htmlFor="legalName">
              <input
                id="legalName"
                name="legalName"
                defaultValue={tenant.legalName ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="SIRET" htmlFor="siret">
              <input
                id="siret"
                name="siret"
                inputMode="numeric"
                defaultValue={tenant.siret ?? ""}
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>

          <Field label="Adresse" htmlFor="street">
            <input
              id="street"
              name="street"
              defaultValue={tenant.address.street ?? ""}
              className={inputClass}
            />
          </Field>

          {/* Deux colonnes, pas trois : à trois, « Code postal » et « Téléphone »
              se tassent sous 1100 px et les libellés passent sous les champs. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Code postal" htmlFor="postalCode">
              <input
                id="postalCode"
                name="postalCode"
                inputMode="numeric"
                defaultValue={tenant.address.postalCode ?? ""}
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field label="Ville" htmlFor="city">
              <input
                id="city"
                name="city"
                defaultValue={tenant.address.city ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Téléphone" htmlFor="phone">
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={tenant.address.phone ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="FINESS"
              htmlFor="finess"
              hint="Pour les structures qui en disposent."
            >
              <input
                id="finess"
                name="finess"
                defaultValue={tenant.finess ?? ""}
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Couleurs et expéditeur"
          subtitle="Le portail patient et les emails reprennent ces éléments."
        />
        <div className="space-y-5 p-5">
          <Field label="Couleur principale" htmlFor="primaryColor">
            <div className="flex items-center gap-3">
              <input
                id="primaryColor"
                name="primaryColor"
                type="color"
                value={primary}
                onChange={(event) => onPrimary(event.target.value)}
                className="h-11 w-16 shrink-0 cursor-pointer rounded-lg border border-line-strong"
              />
              <span className="tabular text-sm text-muted">{primary}</span>
            </div>
          </Field>

          <Field
            label="Nom d'expéditeur"
            htmlFor="senderName"
            hint="Affiché au patient. L'adresse d'envoi reste celle de Ryla, sans quoi les messages n'arriveraient pas."
          >
            <input
              id="senderName"
              name="senderName"
              defaultValue={tenant.branding.senderName ?? tenant.name}
              className={inputClass}
            />
          </Field>

          <input
            type="hidden"
            name="accentColor"
            value={tenant.branding.accentColor ?? "#EA580C"}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Mentions légales et DPO"
          subtitle="Le cabinet est responsable de traitement ; Ryla n'est que sous-traitant. Ces mentions sont les vôtres."
        />
        <div className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact DPO — nom" htmlFor="dpoName">
              <input
                id="dpoName"
                name="dpoName"
                defaultValue={tenant.dpoContact.name ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Contact DPO — email" htmlFor="dpoEmail">
              <input
                id="dpoEmail"
                name="dpoEmail"
                type="email"
                defaultValue={tenant.dpoContact.email ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="Mentions légales"
            htmlFor="legalNotice"
            hint="Reprises au bas des documents signés et sur le portail patient."
          >
            <textarea
              id="legalNotice"
              name="legalNotice"
              rows={4}
              defaultValue={tenant.legalNotice ?? ""}
              className={inputClass}
            />
          </Field>

          <FormFooter
            pending={pending}
            label="Enregistrer les réglages du cabinet"
            saved={saved}
            error={state.status === "error" ? state.message : null}
          />
        </div>
      </Card>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
            <span className="mr-auto flex items-center gap-2 text-sm font-medium text-caution">
              <IconAlert className="size-4" />
              Modifications non enregistrées
            </span>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}


// ---------------------------------------------------------------------------

/**
 * En-tête des documents, dans son propre formulaire.
 *
 * Court et enregistrable d'un geste : composer un en-tête prend du temps, et
 * devoir parcourir toute la page des réglages pour trouver le bouton a déjà
 * coûté un travail perdu.
 */
function LetterheadCard({
  mode,
  onMode,
  blocks,
  onBlocks,
}: {
  mode: string;
  onMode: (value: "none" | "text" | "image") => void;
  blocks: LetterheadBlock[];
  onBlocks: (value: LetterheadBlock[]) => void;
}) {
  const [state, action, pending] = useActionState(saveLetterheadLayout, idleSettings);
  const [dirty, setDirty] = useState(false);
  const saved = state.status === "saved";

  useEffect(() => {
    if (saved) setDirty(false);
  }, [saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form action={action} onChange={() => setDirty(true)}>
      <Card>
        <CardHeader
          title="En-tête des documents"
          subtitle="Un bloc de texte, ou votre papier à en-tête scanné."
        />
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["text", "Texte"],
                ["image", "Image"],
                ["none", "Aucun"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  mode === value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-line text-muted hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="letterheadMode"
                  value={value}
                  checked={mode === value}
                  onChange={() => onMode(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>

          {mode === "text" ? (
            <BlockEditor blocks={blocks} onChange={onBlocks} />
          ) : null}
          <input
            type="hidden"
            name="letterheadBlocks"
            value={JSON.stringify(blocks)}
          />

          {mode === "image" ? (
            <p className="text-sm leading-relaxed text-muted">
              L'envoi de l'image se fait dans le bloc ci-dessous, séparément.
            </p>
          ) : null}

          <FormFooter
            pending={pending}
            label="Enregistrer l'en-tête"
            saved={state.status === "saved"}
            error={state.status === "error" ? state.message : null}
          />
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------

function LetterheadUpload({ hasImage }: { hasImage: boolean }) {
  const [state, action, pending] = useActionState(saveLetterhead, idleLetterhead);

  return (
    <form action={action}>
      <Card>
        <CardHeader
          title="Image d'en-tête"
          subtitle="PNG, JPEG ou WebP, 2 Mo maximum."
        />
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-muted">
            {hasImage
              ? "Une image est déjà en place. En envoyer une nouvelle la remplace."
              : "Prévoyez une bande large : elle est placée en haut de page, à la largeur du document."}
          </p>

          <input
            type="file"
            name="letterheadImage"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Image d'en-tête"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3.5 file:py-2.5 file:text-sm file:font-medium file:text-body"
          />

          <FormFooter
            pending={pending}
            label="Envoyer l'image"
            pendingLabel="Envoi…"
            saved={state.status === "saved"}
            savedLabel="Image enregistrée — rechargez pour la voir dans l'aperçu."
            error={state.status === "error" ? state.message : null}
          />
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------

/**
 * Éditeur d'en-tête, ligne par ligne.
 *
 * Trois tailles, gras, trois alignements — et rien de plus. C'est exactement
 * ce que pdf-lib sait rendre avec les polices standard. Offrir davantage à la
 * saisie donnerait un aperçu qui ne ressemble pas au document imprimé, ce qui
 * est pire que pas de mise en forme du tout sur une pièce que le patient
 * conserve.
 */
function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: LetterheadBlock[];
  onChange: (value: LetterheadBlock[]) => void;
}) {
  const patch = (index: number, changes: Partial<LetterheadBlock>) =>
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...changes } : block)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={index} className="rounded-xl border border-line p-3">
          <input
            value={block.text}
            onChange={(event) => patch(index, { text: event.target.value })}
            aria-label={`Ligne ${index + 1} de l'en-tête`}
            className={inputClass}
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Toggle
              active={block.bold === true}
              onClick={() => patch(index, { bold: !block.bold })}
              label="Gras"
            >
              <span className="font-bold">G</span>
            </Toggle>

            <select
              value={block.size ?? "normal"}
              onChange={(event) =>
                patch(index, { size: event.target.value as LetterheadBlock["size"] })
              }
              aria-label={`Taille de la ligne ${index + 1}`}
              className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-body"
            >
              <option value="title">Titre</option>
              <option value="normal">Normal</option>
              <option value="small">Petit</option>
            </select>

            <div className="flex gap-1">
              {(
                [
                  ["left", "Gauche", "⌐"],
                  ["center", "Centré", "≡"],
                  ["right", "Droite", "¬"],
                ] as const
              ).map(([value, label, glyph]) => (
                <Toggle
                  key={value}
                  active={(block.align ?? "left") === value}
                  onClick={() => patch(index, { align: value })}
                  label={label}
                >
                  {glyph}
                </Toggle>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Toggle
                active={false}
                onClick={() => move(index, -1)}
                label="Monter"
                disabled={index === 0}
              >
                ↑
              </Toggle>
              <Toggle
                active={false}
                onClick={() => move(index, 1)}
                label="Descendre"
                disabled={index === blocks.length - 1}
              >
                ↓
              </Toggle>
              <button
                type="button"
                onClick={() => onChange(blocks.filter((_, i) => i !== index))}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-danger"
              >
                Retirer
              </button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...blocks, { text: "", size: "normal", align: "left" }])
        }
      >
        Ajouter une ligne
      </Button>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex size-8 items-center justify-center rounded-lg border text-sm transition disabled:opacity-30 ${
        active
          ? "border-brand-600 bg-brand-50 text-brand-700"
          : "border-line text-muted hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

function FormFooter({
  pending,
  label,
  pendingLabel = "Enregistrement…",
  saved,
  savedLabel = "Enregistré",
  error,
}: {
  pending: boolean;
  label: string;
  pendingLabel?: string;
  saved: boolean;
  savedLabel?: string;
  error: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5">
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {saved ? (
        <span className="flex items-center gap-1.5 text-sm font-semibold text-positive">
          <IconCheck className="size-4" />
          {savedLabel}
        </span>
      ) : null}
      {error ? (
        <span
          role="alert"
          className="flex items-start gap-1.5 text-sm font-semibold text-danger"
        >
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

function LetterheadPreview({
  mode,
  blocks,
  primary,
  hasImage,
  practitioner,
}: {
  mode: string;
  blocks: LetterheadBlock[];
  primary: string;
  hasImage: boolean;
  practitioner: PractitionerValues;
}) {
  return (
    <Card>
      <CardHeader title="Aperçu" subtitle="Haut d'un devis, à l'échelle." />
      <div className="p-5">
        <div className="overflow-hidden rounded-lg border border-line bg-white p-5 shadow-tile">
          <div className="h-1 w-full rounded-full" style={{ background: primary }} />

          <div className="mt-4 min-h-20">
            <Letterhead
              mode={mode}
              blocks={blocks}
              hasImage={hasImage}
              fallbackName="Sans en-tête : le devis commence par son titre."
            />
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[13px] font-bold text-body">DEVIS</p>
            <p className="tabular mt-0.5 text-[11px] text-faint">
              Nº D-{new Date().getFullYear()}-0001 · établi le{" "}
              {new Date().toLocaleDateString("fr-FR")}
            </p>
            <p className="mt-2 text-[11px] text-faint">
              {practitioner.fullName}
              {practitioner.rpps ? ` · RPPS ${practitioner.rpps}` : null}
            </p>
            {!practitioner.rpps ? (
              <p className="mt-1 text-[11px] font-semibold text-flame-700">
                Identifiant praticien manquant — le devis conventionnel sera refusé.
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          L'en-tête est repris sur les devis et sur les documents signés remis au
          patient.
        </p>
      </div>
    </Card>
  );
}

/**
 * En-tête de départ, composé depuis ce que le cabinet a déjà renseigné.
 *
 * La raison sociale en titre centré, le reste en dessous : c'est la mise en
 * page que font les cabinets à la main, autant la proposer d'emblée.
 */
function defaultLetterhead(tenant: TenantSelf): LetterheadBlock[] {
  const lines: LetterheadBlock[] = [
    { text: tenant.legalName || tenant.name, bold: true, size: "title", align: "center" },
    { text: tenant.address.street ?? "", size: "normal", align: "center" },
    {
      text: [tenant.address.postalCode, tenant.address.city].filter(Boolean).join(" "),
      size: "normal",
      align: "center",
    },
    { text: tenant.address.phone ?? "", size: "small", align: "center" },
    { text: tenant.siret ? `SIRET ${tenant.siret}` : "", size: "small", align: "center" },
  ];
  return lines.filter((block) => block.text.trim() !== "");
}
