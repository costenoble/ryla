"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FadeUp,
  HoverLift,
  RevealOnScroll,
  Stagger,
  StaggerItem,
} from "@/components/motion";
import {
  IconCheck,
  IconDownload,
  IconLink,
  IconLock,
  IconPen,
  IconReceipt,
  IconUsers,
} from "@/components/icons";

/**
 * Page vitrine.
 *
 * Elle s'adresse à un praticien, pas à un ingénieur : aucune mention de
 * chiffrement, de base de données ou de journal chaîné. Ces choix techniques
 * font la valeur du produit mais ne se vendent pas — ce qui se vend, c'est
 * qu'un patient ne puisse plus arriver sans ses papiers.
 *
 * Aucune spécialité n'est nommée non plus. Ryla démarre sur le dentaire et
 * l'esthétique, mais rien dans le produit ne le limite à ces deux-là.
 *
 * Les images sont de **vraies captures du produit**, prises sur l'application
 * qui tourne. Pas de photo de dentiste souriant : pour un logiciel, montrer
 * l'interface qu'on va utiliser convainc plus qu'une banque d'images, et ça
 * évite de promettre en photo ce qui n'existe pas à l'écran.
 *
 * Un point de vigilance à tenir dans le temps : ne rien promettre que le
 * produit ne fasse. Pas d'intégration à un logiciel métier — c'est un
 * téléchargement PDF, et c'est justement l'argument. Pas de paiement en ligne
 * — le cabinet note les règlements qu'il reçoit.
 */

const CAPABILITIES = [
  {
    Icon: IconPen,
    title: "Questionnaires et consentements",
    body:
      "Vous envoyez le document, le patient le remplit et le signe depuis son téléphone, " +
      "chez lui, avant même d'arriver au cabinet.",
  },
  {
    Icon: IconReceipt,
    title: "Devis établis dans Ryla",
    body:
      "Recherchez l'acte, Ryla reprend le code et la base de remboursement, calcule le " +
      "reste à charge et vérifie les mentions obligatoires avant d'enregistrer.",
  },
  {
    Icon: IconDownload,
    title: "Ou vos devis existants, importés",
    body:
      "Vous préférez le devis de votre logiciel ? Déposez le PDF : Ryla le fait signer " +
      "tel quel, sans y toucher une ligne.",
  },
  {
    Icon: IconUsers,
    title: "Vos patients, saisis en dix secondes",
    body:
      "Nom, prénom, email, et c'est parti. Pas de fichier à importer, pas de paramétrage, " +
      "pas de rendez-vous d'installation.",
  },
  {
    Icon: IconLink,
    title: "Un lien sécurisé, jamais de pièce jointe",
    body:
      "Le patient reçoit un lien personnel qui expire. Le message ne dit ni pourquoi ni " +
      "pour quel soin : rien de médical ne circule par email.",
  },
  {
    Icon: IconLock,
    title: "Le suivi des règlements",
    body:
      "Le devis porte le montant et le reste à charge. Vous notez les virements reçus au " +
      "fur et à mesure, et vous voyez d'un coup d'œil ce qui reste à encaisser.",
  },
] as const;

const NO_PAPER = [
  "Le patient ne peut plus oublier ses papiers : il a déjà tout rempli.",
  "Plus de feuilles à imprimer, à classer, à ressortir deux ans plus tard.",
  "Plus de salle d'attente occupée à remplir un questionnaire au stylo.",
  "Plus de relance à faire de tête : vous voyez qui n'a pas encore signé.",
] as const;

export function HomeView({
  signupOpen,
  certifiedHost,
}: {
  signupOpen: boolean;
  /** Faux tant que l'hébergeur HDS n'est pas nommé : on ne le revendique pas. */
  certifiedHost: boolean;
}) {
  return (
    <>
      {/* --- Accroche ------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        {/* Halo de marque : il donne au haut de page une profondeur que le
            fond plat n'a pas, sans ajouter d'image à charger. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 size-184 -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl"
        />

        <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
          <FadeUp>
            <h1 className="max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight text-balance text-body sm:text-5xl">
              Vos questionnaires, consentements et devis,{" "}
              <span className="text-brand-600">signés avant la consultation.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              Le patient reçoit un lien, remplit et signe depuis son téléphone. Vous
              récupérez un PDF prêt à classer dans son dossier. Aucun logiciel à
              installer, aucun papier à ressortir.
            </p>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {signupOpen ? (
                <HoverLift>
                  <Link
                    href="/inscription"
                    className="inline-flex rounded-full bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white shadow-tile transition hover:bg-brand-700 hover:shadow-card"
                  >
                    Créer mon cabinet
                  </Link>
                </HoverLift>
              ) : null}
              <HoverLift>
                <Link
                  href="/connexion"
                  className="inline-flex rounded-full border border-line-strong bg-surface px-6 py-3 text-[15px] font-semibold text-body transition hover:border-brand-400 hover:bg-brand-50"
                >
                  Se connecter
                </Link>
              </HoverLift>
            </div>

            <p className="mt-5 flex items-center gap-2 text-sm text-muted">
              <IconCheck className="size-4 shrink-0 text-positive" />
              Votre bibliothèque de documents est prête dès la création du cabinet.
            </p>
          </FadeUp>

          {/* --- Aperçu du produit ------------------------------------------ */}
          <FadeUp delay={0.16}>
            <div className="relative mt-14">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop ring-1 ring-ink-900/5">
                <Image
                  src="/vitrine/tableau-de-bord.png"
                  alt="Le tableau de bord d'un cabinet : documents signés, en attente, points de vigilance et courbe des signatures."
                  width={2880}
                  height={1800}
                  priority
                  sizes="(max-width: 1024px) 100vw, 960px"
                  className="w-full"
                />
              </div>

              {/* Le portail patient en incrustation : c'est l'autre moitié du
                  produit, et celle que le praticien ne voit jamais. */}
              <div className="absolute -right-2 -bottom-10 hidden w-44 overflow-hidden rounded-3xl border-4 border-white bg-surface shadow-pop lg:block xl:-right-10 xl:w-52">
                <Image
                  src="/vitrine/portail-patient.png"
                  alt="Le portail patient sur téléphone : le questionnaire à remplir, section par section."
                  width={780}
                  height={1560}
                  sizes="208px"
                  className="w-full"
                />
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* --- Ce que fait Ryla ---------------------------------------------- */}
      <section className="mt-16 border-y border-line bg-surface lg:mt-24">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <RevealOnScroll>
            <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Tout ce que vous faites signer, au même endroit
            </h2>
          </RevealOnScroll>

          <Stagger className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ Icon, title, body }) => (
              <StaggerItem key={title}>
                <div className="group h-full rounded-2xl border border-line bg-surface p-5 shadow-tile transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-brand-200 hover:shadow-card">
                  <span className="mb-3.5 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition duration-300 group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-bold text-body">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* --- Le devis ------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <RevealOnScroll>
            <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">
              Devis
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Le code, le tarif et le reste à charge, sans le tableur
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
              <p>
                Vous cherchez l'acte par son nom, Ryla propose le code et la base de
                remboursement. Le reste à charge se calcule tout seul, ligne par ligne,
                et les mentions obligatoires sont vérifiées avant l'enregistrement.
              </p>
              <p>
                Le référentiel ne vous convient pas ? Corrigez-le. Votre version prime
                sur la nôtre, et elle n'appartient qu'à votre cabinet.
              </p>
            </div>
          </RevealOnScroll>

          <RevealOnScroll>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <Image
                src="/vitrine/devis.png"
                alt="L'éditeur de devis : recherche d'un acte, lignes chiffrées et aperçu du document."
                width={2880}
                height={1800}
                sizes="(max-width: 1024px) 100vw, 520px"
                className="w-full"
              />
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* --- Aucune intégration -------------------------------------------- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <RevealOnScroll>
              <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
                Vous gardez votre logiciel. On ne s'y branche pas.
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
                <p>
                  Pas de connecteur à faire installer, pas de projet informatique, pas
                  de technicien à faire venir. Ryla vit à côté de votre logiciel, pas
                  dedans.
                </p>
                <p>
                  Chaque document signé se télécharge en PDF. Vous le déposez dans le
                  dossier du patient de votre logiciel habituel — Logos, VisioDent,
                  Médistory ou un autre, ça n'a aucune importance, ils savent tous
                  recevoir un PDF.
                </p>
                <p className="font-medium text-body">
                  Vous pouvez commencer cet après-midi, sans rien changer à votre
                  installation.
                </p>
              </div>
            </RevealOnScroll>

            <RevealOnScroll>
              <ol className="space-y-3">
                {[
                  [
                    "Vous créez le document",
                    "Depuis la bibliothèque, ou votre propre devis importé.",
                  ],
                  [
                    "Le patient reçoit un lien",
                    "Il remplit et signe depuis son téléphone.",
                  ],
                  [
                    "Vous téléchargez le PDF",
                    "Et vous le classez où vous avez l'habitude.",
                  ],
                ].map(([title, detail], index) => (
                  <li
                    key={title}
                    className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 shadow-tile transition duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card"
                  >
                    <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-semibold text-body">{title}</span>
                      <span className="block text-sm text-muted">{detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* --- Fin du papier -------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <RevealOnScroll>
            <div className="ink-panel relative overflow-hidden rounded-3xl p-7 shadow-ink">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 -right-16 size-52 rounded-full bg-flame-600/15 blur-2xl"
              />
              <p className="relative mb-5 text-sm font-bold text-white">
                Ce que vous ne ferez plus
              </p>
              <ul className="relative space-y-3.5">
                {NO_PAPER.map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-flame-400">
                      <IconCheck className="size-3.5" />
                    </span>
                    <span className="text-sm leading-relaxed text-ink-300">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </RevealOnScroll>

          <RevealOnScroll>
            <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Et vous savez qui a signé, quand, et ce qu'il a lu
            </h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
              <p>
                Chaque signature est accompagnée de son dossier de preuve : le texte
                exact affiché ce jour-là, le temps passé sur chaque section, les cases
                cochées et l'heure précise de chacune.
              </p>
              <p>
                Si l'on vous demande un jour de démontrer que vous aviez bien informé
                votre patient, vous ne présentez pas un paraphe au bas d'une page : vous
                présentez ce qu'il a lu, et combien de temps.
              </p>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* --- Confiance ------------------------------------------------------ */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <RevealOnScroll>
            <h2 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Vos patients vous confient leur santé. Nous la traitons comme telle.
            </h2>
          </RevealOnScroll>

          <Stagger className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              [
                "Rien de médical par email",
                "Le message n'est qu'un lien. Ni le motif, ni le soin, ni le document n'y apparaissent.",
              ],
              [
                "Chaque cabinet est cloisonné",
                "Les réponses de vos patients sont protégées par une clé qui n'appartient qu'à vous.",
              ],
              // Le troisième argument n'apparaît que lorsqu'il est vrai : cf.
              // `hasCertifiedHealthHost()`.
              certifiedHost
                ? ([
                    "Hébergement agréé santé",
                    "Chez un prestataire certifié pour les données de santé, comme la loi l'exige.",
                  ] as const)
                : ([
                    "Vous restez maître de vos données",
                    "Exportez le dossier complet d'un patient quand vous voulez, dans un format ouvert.",
                  ] as const),
            ].map(([title, body]) => (
              <StaggerItem key={title}>
                <div className="group h-full rounded-2xl border border-line bg-surface p-5 shadow-tile transition duration-300 ease-out-expo hover:-translate-y-1 hover:border-brand-200 hover:shadow-card">
                  <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition duration-300 group-hover:bg-brand-600 group-hover:text-white">
                    <IconLock className="size-4" />
                  </span>
                  <h3 className="text-sm font-bold text-body">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* --- Appel à l'action ---------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-1/2 size-160 -translate-x-1/2 rounded-full bg-brand-100/45 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
          <RevealOnScroll>
            <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance text-body sm:text-3xl">
              Le prochain patient peut arriver avec tout déjà signé
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              Créez votre cabinet, envoyez votre premier document dans la foulée. Vos
              modèles sont déjà là.
            </p>

            <div className="mt-8 flex justify-center">
              <HoverLift>
                <Link
                  href={signupOpen ? "/inscription" : "/connexion"}
                  className="inline-flex rounded-full bg-brand-600 px-7 py-3.5 text-[15px] font-semibold text-white shadow-card transition hover:bg-brand-700"
                >
                  {signupOpen ? "Créer mon cabinet" : "Accéder à mon espace"}
                </Link>
              </HoverLift>
            </div>
          </RevealOnScroll>
        </div>
      </section>
    </>
  );
}
