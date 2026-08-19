import type { Metadata } from "next";
import Link from "next/link";
import { IconLock } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { ButtonLink, Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { ROLE_LABELS, type Capability } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accès refusé" };

/**
 * Explications plutôt qu'un mur.
 *
 * Un refus muet fait douter du produit ; un refus expliqué fait comprendre le
 * partage des rôles dans le cabinet. On nomme donc ce qui a été refusé, et à
 * qui le demander.
 */
const EXPLANATIONS: Partial<Record<Capability, string>> = {
  "health.read":
    "La lecture des réponses de santé et le téléchargement des documents signés " +
    "sont réservés aux praticiens. Ce n'est pas une question de confiance : le " +
    "secret médical se définit par un périmètre, pas par une personne.",
  "settings.write":
    "Les réglages du cabinet portent ses mentions légales et son contact DPO, " +
    "dont le titulaire est responsable au sens du RGPD.",
  "templates.write":
    "La rédaction des modèles engage ce que le patient lira et signera : elle " +
    "est réservée aux praticiens.",
  "nomenclature.write":
    "Le référentiel d'actes détermine les codes et les tarifs portés sur les " +
    "devis : sa modification est réservée aux praticiens.",
  "patients.erase":
    "L'effacement des données d'un patient est une décision, pas une " +
    "manipulation : elle revient au titulaire du cabinet.",
};

export default async function AccesRefusePage({
  searchParams,
}: {
  searchParams: Promise<{ droit?: string }>;
}) {
  const session = await requireSession();
  const { droit } = await searchParams;
  const explanation = droit ? EXPLANATIONS[droit as Capability] : undefined;

  return (
    <div className="mx-auto max-w-xl py-10">
      <FadeUp>
        <Card className="p-8 text-center">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-canvas text-muted">
            <IconLock className="size-7" />
          </span>

          <h1 className="text-xl font-bold text-body">Cette action ne vous est pas ouverte</h1>

          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            {explanation ??
              "Votre rôle ne permet pas cette action dans ce cabinet."}
          </p>

          <p className="mt-4 text-sm text-faint">
            Vous êtes connecté(e) comme{" "}
            <span className="font-semibold text-body">
              {ROLE_LABELS[session.user.role]}
            </span>
            . Le titulaire du cabinet peut réaliser cette action ou faire évoluer
            vos droits.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/tableau-de-bord">Retour au tableau de bord</ButtonLink>
            <Link
              href="/patients"
              className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-muted transition hover:text-body"
            >
              Voir les patients
            </Link>
          </div>
        </Card>
      </FadeUp>
    </div>
  );
}
