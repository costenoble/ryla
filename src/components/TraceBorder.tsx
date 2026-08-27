/**
 * Bordure qui se trace au survol.
 *
 * Un SVG en superposition plutôt qu'une bordure CSS : on veut voir le trait
 * *se dessiner*, et une bordure ne s'anime que par sa couleur ou son épaisseur,
 * jamais par sa longueur.
 *
 * `pathLength={1}` est la clé. Il renormalise la longueur du contour à 1 quelle
 * que soit la taille réelle du bouton, ce qui permet d'écrire le pointillé et
 * son décalage en unités fixes. Sans lui, il faudrait connaître le périmètre à
 * l'avance — donc figer la largeur, donc casser le bouton dès qu'on change son
 * libellé.
 *
 * Le `rx` volontairement énorme est ramené par le moteur de rendu à la moitié
 * de la hauteur : le tracé épouse donc n'importe quel rayon, de l'angle droit
 * à la pilule, sans qu'on ait à le lui dire.
 *
 * L'élément parent doit porter `group` et `relative`.
 */
export function TraceBorder({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 size-full overflow-visible ${className ?? ""}`}
    >
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx="9999"
        pathLength={1}
        className="trace-rect"
      />
    </svg>
  );
}
