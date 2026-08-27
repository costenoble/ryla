import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signupOpen } from "@/lib/actions/signup";
import { currentSession } from "@/lib/auth";
import { HomeView } from "./HomeView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ryla — la preuve de l'information délivrée",
  description:
    "Questionnaires médicaux, consentements éclairés et devis conformes, avec le dossier " +
    "de preuve qui va avec. Pour la chirurgie dentaire et la médecine esthétique.",
};

export default async function HomePage() {
  // Un praticien déjà connecté n'a rien à faire sur la vitrine : il vient
  // travailler, pas se laisser convaincre.
  if (await currentSession()) redirect("/tableau-de-bord");

  return <HomeView signupOpen={await signupOpen()} />;
}
