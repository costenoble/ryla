import { Logo } from "@/components/Logo";

/**
 * Voile d'ouverture de la vitrine.
 *
 * Rendu par le serveur et animé en CSS seul : une version pilotée en
 * JavaScript afficherait d'abord la page, puis le voile par-dessus une fois
 * hydratée — soit l'inverse de l'effet voulu.
 *
 * Il ne couvre que la vitrine. Le mettre sur l'espace praticien ferait perdre
 * une seconde et demie à chaque navigation d'une personne qui travaille : un
 * effet de marque se subit une fois, pas quarante fois par jour.
 *
 * `aria-hidden` et pas de rôle de statut : le contenu de la page est déjà
 * présent dans le document sous le voile, un lecteur d'écran le lit sans
 * attendre et n'a rien à savoir de cette décoration.
 */
export function IntroVeil() {
  return (
    <div className="intro-veil" aria-hidden="true">
      <span className="intro-mark">
        <Logo size="lg" withTagline />
      </span>
    </div>
  );
}
