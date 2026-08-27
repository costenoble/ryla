import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signupOpen } from "@/lib/actions/signup";
import { currentSession } from "@/lib/auth";
import { hasCertifiedHealthHost } from "@/lib/legal-entity";
import { HomeView } from "./HomeView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ryla — questionnaires, consentements et devis signés à distance",
  description:
    "Vos patients remplissent et signent depuis leur téléphone avant la consultation. " +
    "Vous récupérez un PDF à classer dans votre logiciel. Aucune installation.",
};

export default async function HomePage() {
  // Un praticien déjà connecté n'a rien à faire sur la vitrine : il vient
  // travailler, pas se laisser convaincre.
  if (await currentSession()) redirect("/tableau-de-bord");

  return (
    <HomeView signupOpen={await signupOpen()} certifiedHost={hasCertifiedHealthHost()} />
  );
}
