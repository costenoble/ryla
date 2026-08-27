"use client";

import Link from "next/link";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconLock,
  IconPen,
  IconReceipt,
  IconShield,
} from "@/components/icons";

/**
 * Page vitrine.
 *
 * Le positionnement tient en une phrase : le questionnaire numérique est une
 * commodité depuis que Doctolib le distribue gratuitement ; prouver ce qu'un
 * patient a lu, deux ans plus tard, ne l'est pas. Toute la page découle de là,
 * et rien n'y promet de « gagner du temps » — c'est l'argument de tous les
 * concurrents, et ce n'est pas celui qui fait signer un chirurgien qui a déjà
 * été mis en cause.
 *
 * L'indigo reste une surface et l'orange un signal, conformément à la direction
 * artistique : aucune couleur ne porte ici de sens qu'elle n'a pas ailleurs
 * dans le produit.
 */

const PROOF_ITEMS = [
  ["Empreinte de la version du formulaire", "Le texte exact affiché, non modifiable après coup"],
  ["Empreinte des réponses", "L'intégrité du contenu, sans le divulguer"],
  ["Horodatages envoi, ouverture, saisie, signature", "La chronologie réelle"],
  ["Temps d'affichage par section", "Une signature obtenue en quatre secondes se voit"],
  ["Déclarations cochées une par une", "Ce qui a été accepté, et à quelle seconde"],
  ["Tête de la chaîne d'audit", "Le rattachement à un journal infalsifiable"],
] as const;

const LEGAL_ITEMS = [
  {
    Icon: IconReceipt,
    title: "Devis dentaire CERFA S3404",
    body:
      "Codes CCAM, base de remboursement, reste à charge et panier de soins contrôlés " +
      "avant enregistrement. Le reste à charge nul du panier 100 % santé est un invariant testé.",
  },
  {
    Icon: IconClock,
    title: "Délai de réflexion de 15 jours",
    body:
      "En chirurgie esthétique (art. D6322-30 CSP). Il démarre à la remise du devis, " +
      "horodatée par la base, et l'acceptation est refusée côté serveur tant qu'il court.",
  },
  {
    Icon: IconPen,
    title: "Charge de la preuve de l'information",
    body:
      "L'article L1111-2 du CSP la met sur le praticien. C'est exactement ce que le " +
      "dossier de preuve assemble, à chaque signature.",
  },
  {
    Icon: IconShield,
    title: "Traçabilité des accès",
    body:
      "Chaque consultation d'un dossier est journalisée. Le journal est en ajout seul " +
      "et chaîné par empreinte : une falsification casse la chaîne, de façon détectable.",
  },
] as const;

export function HomeView({ signupOpen }: { signupOpen: boolean }) {
  return (
    <>
      {/* --- Accroche ------------------------------------------------------ */}
      <section className="mx-auto max-w-5xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <FadeUp>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-flame-50 px-3.5 py-1.5 text-xs font-semibold text-flame-700">
            <IconAlert className="size-3.5" />
            Chirurgie dentaire et médecine esthétique
          </p>

          <h1 className="max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight text-balance text-body sm:text-5xl">
            Le questionnaire est devenu gratuit.{" "}
            <span className="text-brand-600">La preuve, non.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Prouver, deux ans plus tard, <em>quel texte exact</em> un patient a lu,
            combien de temps il l'a lu, ce qu'il a coché et à quelle seconde. C'est ce
            que Ryla produit, sur les deux spécialités où l'enjeu juridique est le plus
            fort.
          </p>
        </FadeUp>

        <FadeUp delay={0.08}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signupOpen ? (
              <Link
                href="/inscription"
                className="rounded-full bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white shadow-tile transition hover:bg-brand-700 hover:shadow-card"
              >
                Créer mon cabinet
              </Link>
            ) : null}
            <Link
              href="/connexion"
              className="rounded-full border border-line-strong bg-surface px-6 py-3 text-[15px] font-semibold text-body transition hover:border-brand-300 hover:bg-brand-50/60"
            >
              Se connecter
            </Link>
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <IconLock className="size-4 shrink-0" />
            Zéro donnée de santé dans les emails de votre cabinet.
          </p>
        </FadeUp>
      </section>

      {/* --- Le problème --------------------------------------------------- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <FadeUp>
            <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Un paraphe au bas d'un PDF ne prouve pas grand-chose
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
              En cas de litige, ce n'est pas au patient de démontrer qu'il n'a pas été
              informé : c'est au praticien de démontrer qu'il l'a été. Un document signé
              sans contexte ne dit ni ce qui était écrit à l'écran ce jour-là, ni si le
              patient a eu le temps de le lire.
            </p>
          </FadeUp>

          <FadeUp delay={0.06}>
            <div className="mt-9 overflow-hidden rounded-2xl border border-line">
              <div className="ink-panel px-5 py-4">
                <p className="text-sm font-bold text-white">
                  Ce que Ryla scelle à chaque signature
                </p>
              </div>
              <dl className="divide-y divide-line bg-surface">
                {PROOF_ITEMS.map(([label, meaning]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5"
                  >
                    <dt className="flex min-w-0 flex-1 items-start gap-2.5 text-sm font-semibold text-body">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-positive" />
                      {label}
                    </dt>
                    <dd className="text-sm text-muted sm:w-[46%]">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* --- Contraintes légales ------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <FadeUp>
          <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
            Les obligations, écrites dans le code
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            Pas des rappels dans une notice : des contrôles qui refusent d'enregistrer
            un document non conforme.
          </p>
        </FadeUp>

        <Stagger className="mt-9 grid gap-4 sm:grid-cols-2">
          {LEGAL_ITEMS.map(({ Icon, title, body }) => (
            <StaggerItem key={title}>
              <div className="h-full rounded-2xl border border-line bg-surface p-5 shadow-tile">
                <span className="mb-3.5 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-bold text-body">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* --- Sécurité ------------------------------------------------------ */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <FadeUp>
              <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
                L'isolation est dans la base, pas dans le code
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
                <p>
                  Chaque table porte une politique de sécurité au niveau des lignes.
                  L'application n'écrit jamais «&nbsp;where cabinet =&nbsp;»&nbsp;: elle
                  pose le contexte et PostgreSQL fait le reste. Un oubli dans une requête
                  ne peut donc pas provoquer de fuite entre cabinets.
                </p>
                <p>
                  Les réponses de santé sont chiffrées avec une clé propre à chaque
                  cabinet. Révoquer un cabinet, c'est détruire sa clé&nbsp;; une copie de
                  la base seule ne donne aucune réponse lisible.
                </p>
              </div>
            </FadeUp>

            <FadeUp delay={0.08}>
              <div className="ink-panel rounded-3xl p-7 shadow-ink">
                <ul className="space-y-4">
                  {[
                    ["Chiffrement par cabinet", "AES-256-GCM, une clé par cabinet"],
                    ["Journal chaîné", "En ajout seul, falsification détectable"],
                    ["Emails sans donnée de santé", "L'objet lui-même ne révèle rien"],
                    ["Hébergement certifié HDS", "Art. L1111-8 du code de la santé publique"],
                  ].map(([title, detail]) => (
                    <li key={title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-flame-400">
                        <IconCheck className="size-3.5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-white">
                          {title}
                        </span>
                        <span className="block text-sm text-ink-300">{detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* --- Appel à l'action ---------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <FadeUp>
          <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
            Votre bibliothèque est prête dès la création du cabinet
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Questionnaires et consentements de votre spécialité, relus et versionnés.
            Vous les adaptez, Ryla garde la trace de chaque version.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {signupOpen ? (
              <Link
                href="/inscription"
                className="rounded-full bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white shadow-tile transition hover:bg-brand-700 hover:shadow-card"
              >
                Créer mon cabinet
              </Link>
            ) : (
              <Link
                href="/connexion"
                className="rounded-full bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white shadow-tile transition hover:bg-brand-700"
              >
                Accéder à mon espace
              </Link>
            )}
          </div>
        </FadeUp>
      </section>
    </>
  );
}
