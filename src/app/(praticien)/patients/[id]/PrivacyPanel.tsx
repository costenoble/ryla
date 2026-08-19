"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { IconAlert, IconDownload, IconLock } from "@/components/icons";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import {
  erasePatientIdentity,
  type ErasureState,
} from "@/lib/actions/patient-privacy";

const idle: ErasureState = { status: "idle" };

/**
 * Droits du patient sur ses données.
 *
 * Le panneau dit ce que l'effacement fait *et ce qu'il ne fait pas*. Laisser
 * croire à une suppression totale exposerait le cabinet deux fois : au patient
 * qui découvrirait que son consentement existe toujours, et au praticien qui
 * croirait avoir détruit sa propre pièce de défense.
 */
export function PrivacyPanel({
  patientId,
  canErase,
}: {
  patientId: string;
  canErase: boolean;
}) {
  const [state, action, pending] = useActionState(erasePatientIdentity, idle);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "erased") router.push("/patients");
  }, [state, router]);

  return (
    <Card>
      <CardHeader
        title="Données personnelles"
        subtitle="Droits d'accès, de portabilité et d'effacement du patient."
      />
      <div className="space-y-4 p-5">
        <div>
          <a
            href={`/api/patients/${patientId}/export`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline underline-offset-2 transition hover:text-brand-700"
          >
            <IconDownload className="size-4" />
            Exporter toutes ses données
          </a>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Fichier JSON : état civil, réponses, devis, signatures et journal des
            accès. C'est le format attendu par l'article 20 du RGPD.
          </p>
        </div>

        {canErase ? (
          <div className="border-t border-line pt-4">
            {!open ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-sm font-semibold text-muted transition hover:text-danger"
              >
                Traiter une demande d'effacement…
              </button>
            ) : (
              <form action={action} className="space-y-3">
                <input type="hidden" name="patientId" value={patientId} />

                <div className="rounded-md bg-caution-soft px-3.5 py-3 text-xs leading-relaxed text-caution">
                  <p className="font-semibold">
                    L'effacement retire l'identité, pas les documents signés.
                  </p>
                  <p className="mt-1.5">
                    Nom, date de naissance, coordonnées, notes et représentant
                    légal sont supprimés, et les liens en cours désactivés. Les
                    consentements et devis déjà signés sont conservés : l'article
                    17.3 du RGPD écarte l'effacement quand la conservation sert à
                    constater ou défendre un droit en justice — c'est exactement
                    la pièce que vous devrez produire si votre responsabilité est
                    mise en cause. Le journal d'audit est chaîné et ne peut pas
                    être amputé sans le rendre invérifiable.
                  </p>
                </div>

                <Field
                  label="Confirmation"
                  htmlFor="confirmation"
                  required
                  hint="Saisissez EFFACER en majuscules. L'opération est irréversible."
                >
                  <input
                    id="confirmation"
                    name="confirmation"
                    required
                    autoComplete="off"
                    className={inputClass}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="outline" size="sm" disabled={pending}>
                    {pending ? "Effacement…" : "Effacer l'identité"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium text-muted transition hover:text-body"
                  >
                    Annuler
                  </button>
                </div>

                {state.status === "error" ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-sm font-semibold text-danger"
                  >
                    <IconAlert className="mt-0.5 size-4 shrink-0" />
                    {state.message}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-1.5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            <IconLock className="mt-0.5 size-3.5 shrink-0" />
            L'effacement est réservé au titulaire du cabinet.
          </p>
        )}
      </div>
    </Card>
  );
}
