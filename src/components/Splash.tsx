import { Logo } from "@/components/Logo";

/**
 * Écran d'attente, avec le logo.
 *
 * Next affiche ce composant pendant qu'une page serveur se rend — quelques
 * dixièmes de seconde en local, davantage sur une connexion de cabinet. Sans
 * lui, la page reste blanche et donne l'impression que le clic n'a rien fait.
 *
 * Il n'y a délibérément pas de barre de progression : elle mentirait, puisque
 * personne ne connaît la durée. Un logo qui respire dit « ça travaille » sans
 * rien promettre.
 *
 * L'animation est portée par une classe CSS et non par framer-motion : ce
 * composant s'affiche justement quand le JavaScript de la page n'est pas encore
 * là. `prefers-reduced-motion` la désactive, comme partout ailleurs.
 */
export function Splash({ label = "Chargement…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4"
    >
      <span className="splash-pulse">
        <Logo size="md" />
      </span>
      <span className="sr-only">{label}</span>

      {/* Trois points, purement décoratifs : le texte du statut est déjà lu par
          les lecteurs d'écran via la classe `sr-only` ci-dessus. */}
      <span aria-hidden="true" className="flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="splash-dot size-1.5 rounded-full bg-brand-600"
            style={{ animationDelay: `${index * 140}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
