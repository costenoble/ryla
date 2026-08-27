import Image from "next/image";

/**
 * Rideau d'ouverture de la vitrine.
 *
 * Deux pans indigo qui s'écartent, la marque au centre de la fente. Rendu par
 * le serveur et animé en CSS seul : une version pilotée en JavaScript
 * afficherait d'abord la page, puis le rideau par-dessus une fois hydratée —
 * soit l'inverse de l'effet voulu. Ici le rideau est là au premier pixel peint.
 *
 * Le symbole et le mot-clé sont recomposés à la main plutôt que repris du
 * composant `Logo` : la séquence les anime séparément — le symbole grandit, le
 * mot-clé se dévoile ensuite de gauche à droite — ce que le logo assemblé ne
 * permet pas.
 *
 * Il ne couvre que la vitrine. Sur l'espace praticien, il ferait perdre deux
 * secondes à chaque navigation de quelqu'un qui travaille : un effet de marque
 * se subit une fois, pas quarante fois par jour.
 *
 * `aria-hidden` et aucun rôle de statut : le contenu de la page est déjà dans
 * le document sous le rideau, un lecteur d'écran le lit sans attendre et n'a
 * rien à savoir de cette décoration.
 */
export function IntroVeil() {
  return (
    <div className="intro-veil" aria-hidden="true">
      <div className="ink-panel intro-half intro-half--top" />
      <div className="ink-panel intro-half intro-half--bottom" />

      <div className="intro-brand">
        <span className="intro-mark">
          <Image
            src="/ryla-mark.png"
            alt=""
            width={72}
            height={58}
            priority
            className="relative select-none"
          />
        </span>
        <span className="intro-word">Ryla</span>
        <span className="intro-tag">Le cabinet zéro papier</span>
      </div>
    </div>
  );
}
