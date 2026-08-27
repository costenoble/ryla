import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { currentSession } from "@/lib/auth";
import { signupOpen } from "@/lib/actions/signup";
import { env } from "@/lib/env";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Créer un cabinet" };

export default async function InscriptionPage() {
  if (await currentSession()) redirect("/tableau-de-bord");

  // Fermée seulement si `RYLA_SIGNUP=closed`. Un 404 plutôt qu'un message
  // d'indisponibilité : inutile d'annoncer une porte à qui n'a pas la clé.
  if (!(await signupOpen())) notFound();

  return (
    <main className="min-h-dvh px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Retour à l'accueil
        </Link>

        <Link href="/" className="mb-8 block w-fit">
          <Logo size="md" withTagline />
        </Link>

        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-[28px]">
            Créer votre cabinet
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Quelques minutes, et votre espace est prêt : la bibliothèque de
            questionnaires et de consentements de votre spécialité est installée
            d'emblée.
          </p>
        </header>

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <SignupForm requiresCode={Boolean(env.signupCode)} />
        </div>
      </div>
    </main>
  );
}
