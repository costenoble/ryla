import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { TraceBorder } from "@/components/TraceBorder";
import { signupOpen } from "@/lib/actions/signup";
import { hasCertifiedHealthHost } from "@/lib/legal-entity";

/**
 * Ces pages-ci sont indexables, contrairement au reste du site.
 *
 * La règle globale est `noindex` : les adresses de portail patient sont des
 * secrets, et l'espace praticien n'a rien à faire dans un moteur de recherche.
 * Mais une vitrine que personne ne peut trouver ne sert à rien, et des mentions
 * légales introuvables ne remplissent pas leur office. On lève donc la règle
 * ici, et seulement ici.
 */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

/**
 * Coque des pages publiques.
 *
 * Vitrine et pages légales partagent le même en-tête et le même pied : ce sont
 * les seules pages qu'un praticien voit avant de décider s'il nous confie des
 * dossiers médicaux, et une page légale qui ne ressemble pas au produit fait
 * douter de l'ensemble.
 *
 * Les liens légaux vivent dans le pied de toutes les pages publiques : la LCEN
 * impose qu'ils soient accessibles depuis n'importe quel point du site, pas
 * seulement depuis l'accueil.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sans ce contrôle, le bouton pointait vers /inscription même quand la page
  // n'existait pas — un 404 depuis le bouton principal du site.
  const canSignup = await signupOpen();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/" aria-label="Ryla — accueil">
            <Logo size="sm" />
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/connexion"
              className="group relative rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:text-brand-700"
            >
              <TraceBorder />
              Se connecter
            </Link>
            {canSignup ? (
              <Link
                href="/inscription"
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-tile transition hover:bg-brand-700 hover:shadow-card"
              >
                Créer un cabinet
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-xs">
              <Logo size="sm" />
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Vos questionnaires, consentements et devis remplis et signés à
                distance, prêts à classer dans le dossier du patient.
              </p>
            </div>

            <nav aria-label="Informations légales" className="text-sm">
              <p className="mb-2.5 font-semibold text-body">Informations légales</p>
              <ul className="space-y-2">
                {(
                  [
                    ["/mentions-legales", "Mentions légales"],
                    ["/confidentialite", "Politique de confidentialité"],
                    ["/sous-traitance", "Contrat de sous-traitance (RGPD)"],
                    ["/conditions", "Conditions d'utilisation"],
                  ] as const
                ).map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-muted transition hover:text-brand-700"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <p className="mt-9 border-t border-line pt-5 text-xs text-faint">
            © {new Date().getFullYear()} Ryla
            {hasCertifiedHealthHost()
              ? ". Les données de santé sont hébergées chez un prestataire certifié HDS (art. L1111-8 du code de la santé publique)."
              : "."}
          </p>
        </div>
      </footer>
    </div>
  );
}
