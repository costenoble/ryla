"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import {
  saveLetterhead,
  saveTenantSettings,
  type LetterheadState,
  type SettingsState,
} from "@/lib/actions/tenant";
import type { TenantSelf } from "@/lib/repos/tenants";

const initial: SettingsState = { status: "idle" };
const initialLetterhead: LetterheadState = { status: "idle" };

/**
 * Réglages du cabinet.
 *
 * L'aperçu d'en-tête est à droite et se met à jour à la frappe : c'est le seul
 * endroit du produit où le praticien décide de ce qui sera imprimé en tête de
 * ses devis, et il doit le voir avant d'enregistrer, pas après avoir envoyé un
 * document à un patient.
 */
export function SettingsForm({ tenant }: { tenant: TenantSelf }) {
  const [state, formAction, pending] = useActionState(saveTenantSettings, initial);

  const [mode, setMode] = useState(tenant.branding.letterheadMode ?? "none");
  const [text, setText] = useState(
    tenant.branding.letterheadText ?? defaultLetterhead(tenant),
  );
  const [primary, setPrimary] = useState(tenant.branding.primaryColor ?? "#2563EB");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={formAction} className="space-y-6">
        <Card>
          <CardHeader
            title="Identité du cabinet"
            subtitle="Ces mentions figurent sur les devis et les documents signés."
          />
          <div className="space-y-5 p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nom du cabinet" htmlFor="name" required>
                <input
                  id="name"
                  name="name"
                  required
                  defaultValue={tenant.name}
                  className={inputClass}
                />
              </Field>
              <Field label="Raison sociale" htmlFor="legalName">
                <input
                  id="legalName"
                  name="legalName"
                  defaultValue={tenant.legalName ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="SIRET" htmlFor="siret">
                <input
                  id="siret"
                  name="siret"
                  defaultValue={tenant.siret ?? ""}
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
                  className={inputClass}
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

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Code postal" htmlFor="postalCode">
                <input
                  id="postalCode"
                  name="postalCode"
                  defaultValue={tenant.address.postalCode ?? ""}
                  className={inputClass}
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
              <Field label="Téléphone" htmlFor="phone">
                <input
                  id="phone"
                  name="phone"
                  defaultValue={tenant.address.phone ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </Card>

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
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>

            {mode === "text" ? (
              <Field
                label="Bloc d'en-tête"
                htmlFor="letterheadText"
                hint="Une ligne par information. C'est ce qui s'imprime en haut du devis."
              >
                <textarea
                  id="letterheadText"
                  name="letterheadText"
                  rows={6}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className={`${inputClass} font-mono text-sm`}
                />
              </Field>
            ) : (
              <input type="hidden" name="letterheadText" value={text} />
            )}

            {mode === "image" ? <LetterheadUpload hasImage={Boolean(tenant.branding.letterheadImageKey)} /> : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Couleurs et expéditeur"
            subtitle="Le portail patient et les emails reprennent ces éléments."
          />
          <div className="space-y-5 p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Couleur principale" htmlFor="primaryColor">
                <div className="flex items-center gap-3">
                  <input
                    id="primaryColor"
                    name="primaryColor"
                    type="color"
                    value={primary}
                    onChange={(event) => setPrimary(event.target.value)}
                    className="h-10 w-16 cursor-pointer rounded-lg border border-line"
                  />
                  <span className="tabular text-sm text-muted">{primary}</span>
                </div>
              </Field>
              <Field
                label="Nom d'expéditeur"
                htmlFor="senderName"
                hint="Affiché au patient. L'adresse d'envoi reste celle de Ryla."
              >
                <input
                  id="senderName"
                  name="senderName"
                  defaultValue={tenant.branding.senderName ?? tenant.name}
                  className={inputClass}
                />
              </Field>
            </div>
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
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending} size="lg">
            {pending ? "Enregistrement…" : "Enregistrer les réglages"}
          </Button>
          {state.status === "saved" ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-positive">
              <IconCheck className="size-4" />
              Réglages enregistrés
            </span>
          ) : null}
          {state.status === "error" ? (
            <span
              role="alert"
              className="flex items-center gap-1.5 text-sm font-semibold text-danger"
            >
              <IconAlert className="size-4" />
              {state.message}
            </span>
          ) : null}
        </div>
      </form>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <LetterheadPreview
          mode={mode}
          text={text}
          primary={primary}
          hasImage={Boolean(tenant.branding.letterheadImageKey)}
        />
      </div>
    </div>
  );
}

/**
 * Envoi de l'image, dans son propre formulaire.
 *
 * Un `<form>` imbriqué serait invalide en HTML, et fusionner l'image au reste
 * des réglages obligerait à repasser deux mégaoctets à chaque changement de
 * couleur.
 */
function LetterheadUpload({ hasImage }: { hasImage: boolean }) {
  const [state, formAction, pending] = useActionState(saveLetterhead, initialLetterhead);

  return (
    <div className="rounded-xl border border-dashed border-line-strong p-4">
      <p className="text-sm font-medium text-body">
        {hasImage ? "Remplacer l'image d'en-tête" : "Téléverser une image d'en-tête"}
      </p>
      <p className="mt-1 text-xs text-muted">
        PNG, JPEG ou WebP, 2 Mo maximum. Prévoyez une bande large — elle est
        placée en haut de page, à la largeur du document.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="letterheadImage"
          accept="image/png,image/jpeg,image/webp"
          form="letterhead-upload"
          className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:text-sm file:font-medium file:text-body"
        />
        <Button type="submit" form="letterhead-upload" variant="outline" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p className="mt-2 text-xs font-semibold text-positive">
          Image enregistrée. Rechargez pour la voir dans l'aperçu.
        </p>
      ) : null}
      <form id="letterhead-upload" action={formAction} />
    </div>
  );
}

function LetterheadPreview({
  mode,
  text,
  primary,
  hasImage,
}: {
  mode: string;
  text: string;
  primary: string;
  hasImage: boolean;
}) {
  return (
    <Card>
      <CardHeader title="Aperçu" subtitle="Haut d'un devis, à l'échelle." />
      <div className="p-5">
        <div className="rounded-lg border border-line bg-white p-5 shadow-tile">
          <div className="h-1 w-full rounded-full" style={{ background: primary }} />

          <div className="mt-4 min-h-[92px]">
            {mode === "image" ? (
              hasImage ? (
                // Image privée servie par une route authentifiée : `next/image`
                // ne saurait pas l'optimiser, et n'a rien à y gagner ici.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/api/branding/letterhead"
                  alt="En-tête du cabinet"
                  className="max-h-28 w-full object-contain object-left"
                />
              ) : (
                <p className="text-xs text-faint">
                  Aucune image envoyée pour l'instant.
                </p>
              )
            ) : mode === "text" ? (
              <p className="text-xs leading-relaxed whitespace-pre-line text-body">
                {text.trim() === "" ? "Bloc d'en-tête vide." : text}
              </p>
            ) : (
              <p className="text-xs text-faint">
                Sans en-tête : le devis commence directement par son titre.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[13px] font-bold text-body">DEVIS</p>
            <p className="mt-0.5 text-[11px] text-faint">
              Nº D-2026-0001 · établi le {new Date().toLocaleDateString("fr-FR")}
            </p>
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

/** Bloc de départ, composé depuis ce que le cabinet a déjà renseigné. */
function defaultLetterhead(tenant: TenantSelf): string {
  return [
    tenant.legalName || tenant.name,
    tenant.address.street,
    [tenant.address.postalCode, tenant.address.city].filter(Boolean).join(" "),
    tenant.address.phone,
    tenant.siret ? `SIRET ${tenant.siret}` : null,
  ]
    .filter((line) => line && String(line).trim() !== "")
    .join("\n");
}
