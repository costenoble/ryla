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
 * Le rayon doit correspondre à celui de l'élément habillé, sinon le trait
 * flotte à côté de la forme au lieu de l'épouser. Les valeurs admises sont
 * celles de l'échelle de `globals.css` — pas de troisième rayon inventé ici,
 * c'est exactement ce qui fait « bricolé ».
 *
 * L'élément parent doit porter `group` et `relative`.
 */
const RADII = {
  /** 12 px — `rounded-md`. */
  md: 12,
  /** 16 px — `rounded-lg`. */
  lg: 16,
  /** 20 px — `rounded-xl`. */
  xl: 20,
  /** Pilule : le moteur de rendu ramène le rayon à la moitié de la hauteur. */
  full: 9999,
} as const;

export function TraceBorder({
  radius = "md",
  className,
}: {
  /** À accorder au `rounded-*` de l'élément habillé. */
  radius?: keyof typeof RADII;
  className?: string;
}) {
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
        rx={RADII[radius]}
        pathLength={1}
        className="trace-rect"
      />
    </svg>
  );
}
