import { permanentRedirect } from "next/navigation";

/**
 * Ancien chemin du portail patient.
 *
 * Le chemin canonique est devenu `/formulaire/…` — un patient qui reçoit un
 * lien doit pouvoir lire ce qu'il ouvre avant de cliquer. Les liens déjà
 * envoyés portent l'ancien chemin et doivent continuer de fonctionner : ils
 * ont une durée de vie de plusieurs jours, et rien ne serait plus mauvais que
 * de casser le lien d'un patient au milieu de son parcours.
 */
export default async function LegacyPortalRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  permanentRedirect(`/formulaire/${token}`);
}
