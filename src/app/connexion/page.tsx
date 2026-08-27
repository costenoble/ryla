import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowLeft, IconLock, IconPen, IconShield } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { signupOpen } from "@/lib/actions/signup";
import { currentHost, currentSession } from "@/lib/auth";
import { listTenantsForLogin, tenantSlugFromHost } from "@/lib/tenant";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connexion" };

const ARGUMENTS = [
  {
    Icon: IconShield,
    title: "Zéro donnée de santé par email",
    body: "Vos patients reçoivent un lien vers un portail sécurisé, jamais un document en pièce jointe.",
  },
  {
    Icon: IconPen,
    title: "Le dossier de preuve, pas juste la signature",
    body: "Texte affiché, temps de lecture, horodatage : ce qu'il faut pour démontrer que vous avez informé.",
  },
  {
    Icon: IconLock,
    title: "Chiffré, cloisonné, journalisé",
    body: "Une clé par cabinet, un journal d'audit chaîné, chaque consultation de dossier tracée.",
  },
];

export default async function LoginPage() {
  if (await currentSession()) redirect("/tableau-de-bord");

  // Sur un sous-domaine de cabinet, le champ « cabinet » n'a pas lieu d'être.
  // En local il n'y a pas de sous-domaine : on propose la liste plutôt que de
  // demander de deviner un identifiant interne.
  const slugFromHost = tenantSlugFromHost(await currentHost());
  const tenants = slugFromHost === null ? await listTenantsForLogin() : [];

  return (
    <main className="min-h-dvh lg:flex lg:p-3">
      {/* --- Panneau de marque : masqué sur petit écran, où il ne ferait que
              repousser le formulaire sous la ligne de flottaison. --------- */}
      <section className="ink-panel relative hidden overflow-hidden rounded-3xl p-10 shadow-ink lg:flex lg:w-[46%] lg:flex-col xl:p-12">
        <Link href="/" aria-label="Retour à l'accueil" className="w-fit">
          <Logo tone="light" size="lg" withTagline />
        </Link>

        <div className="mt-auto">
          <h2 className="max-w-md text-[34px] leading-[1.15] font-bold tracking-tight text-white xl:text-[40px]">
            Le questionnaire est une commodité.
            <span className="block text-flame-400">La preuve ne l'est pas.</span>
          </h2>

          <ul className="mt-10 space-y-6">
            {ARGUMENTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-flame-400 ring-1 ring-white/10 ring-inset">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block max-w-sm text-sm leading-relaxed text-ink-300">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 text-xs text-ink-400">
          Hébergement chez un prestataire certifié HDS · Conforme RGPD
        </p>
      </section>

      {/* --- Formulaire ---------------------------------------------------- */}
      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 block lg:hidden">
            <Logo size="lg" withTagline />
          </Link>

          {/* Sur grand écran le logo du panneau de marque sert déjà de retour ;
              ce lien-ci le double d'une formulation explicite, pour qui ne
              devine pas qu'un logo est cliquable. */}
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
          >
            <IconArrowLeft className="size-4" />
            Retour à l'accueil
          </Link>

          
          <h1 className="text-2xl font-bold tracking-tight text-body">Espace praticien</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Connectez-vous pour accéder aux dossiers de votre cabinet.
          </p>

          <div className="mt-7">
            <LoginForm
              showCabinetField={slugFromHost === null}
              tenants={tenants}
              signupOpen={await signupOpen()}
            />
          </div>

          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-faint">
            <IconLock className="mt-0.5 size-3.5 shrink-0" />
            Accès réservé aux professionnels de santé. Toutes les connexions, réussies
            ou non, sont journalisées.
          </p>
        </div>
      </section>
    </main>
  );
}
