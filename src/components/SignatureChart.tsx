"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, useMemo, useState } from "react";

/**
 * Signatures par jour sur quatorze jours.
 *
 * Une seule série, donc une seule teinte et pas de légende : le titre nomme la
 * série, une boîte de légende à une entrée n'apprendrait rien. Aire plutôt que
 * barres parce que la lecture attendue est un rythme, pas une comparaison
 * jour à jour.
 *
 * L'indigo de marque est écarté ici : trop sombre pour servir de marque de
 * données sur fond blanc. Il reste une couleur de surface, le bleu porte la
 * donnée.
 *
 * Un tableau équivalent est rendu pour les lecteurs d'écran — la courbe n'est
 * pas le seul accès aux valeurs.
 */

export type Point = { date: string; count: number };

const W = 720;
const H = 220;
const PAD = { top: 16, right: 8, bottom: 26, left: 8 };

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function SignatureChart({ series }: { series: Point[] }) {
  const gradientId = useId();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const max = Math.max(1, ...series.map((p) => p.count));
    // Un peu d'air au-dessus du pic : une courbe qui touche le bord haut donne
    // l'impression d'être tronquée.
    const scaleMax = max === 1 ? 2 : max * 1.25;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const step = series.length > 1 ? innerW / (series.length - 1) : 0;

    const points = series.map((point, index) => ({
      ...point,
      x: PAD.left + index * step,
      y: PAD.top + innerH - (point.count / scaleMax) * innerH,
    }));

    // Courbe de Catmull-Rom convertie en Bézier : lisse sans dépasser les
    // valeurs, contrairement à une interpolation en cardinal trop tendue qui
    // ferait apparaître des signatures négatives entre deux zéros.
    const line = points
      .map((point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previous = points[index - 1]!;
        const cx = (previous.x + point.x) / 2;
        return `C ${cx} ${previous.y} ${cx} ${point.y} ${point.x} ${point.y}`;
      })
      .join(" ");

    const base = PAD.top + innerH;
    const last = points[points.length - 1];
    const first = points[0];
    const area =
      first && last
        ? `${line} L ${last.x} ${base} L ${first.x} ${base} Z`
        : "";

    return { points, line, area, base, step, max };
  }, [series]);

  const active = hover === null ? null : geometry.points[hover];
  const total = series.reduce((sum, point) => sum + point.count, 0);

  return (
    <figure className="m-0">
      <div
        className="relative"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const x = ratio * W;
          // Zone de survol par jour : bien plus large que le point lui-même,
          // sinon il faut viser au pixel près.
          const index = Math.round((x - PAD.left) / (geometry.step || 1));
          setHover(Math.max(0, Math.min(series.length - 1, index)));
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[220px] w-full touch-none"
          role="img"
          aria-label={`Signatures par jour sur quatorze jours, ${total} au total`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grille discrète : elle situe, elle ne se regarde pas. */}
          {[0, 0.5, 1].map((ratio) => {
            const y = PAD.top + (H - PAD.top - PAD.bottom) * ratio;
            return (
              <line
                key={ratio}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <motion.path
            d={geometry.area}
            fill={`url(#${gradientId})`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          />

          <motion.path
            d={geometry.line}
            fill="none"
            stroke="var(--color-brand-600)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />

          {active ? (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top - 6}
                y2={geometry.base}
                stroke="var(--color-brand-300)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              {/* Anneau de surface : le point reste lisible par-dessus l'aire. */}
              <circle
                cx={active.x}
                cy={active.y}
                r="5.5"
                fill="var(--color-brand-600)"
                stroke="var(--color-surface)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}

          {series.map((point, index) =>
            index % 3 === 0 || index === series.length - 1 ? (
              <text
                key={point.date}
                x={geometry.points[index]?.x ?? 0}
                y={H - 6}
                textAnchor={
                  index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"
                }
                className="fill-faint text-[11px] tabular"
              >
                {formatDay(point.date)}
              </text>
            ) : null,
          )}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink-900 px-3 py-2 text-center shadow-pop"
            style={{
              left: `${(active.x / W) * 100}%`,
              top: `${(active.y / H) * 100 - 4}%`,
            }}
          >
            <p className="text-xs font-semibold whitespace-nowrap text-white">
              {active.count} signature{active.count > 1 ? "s" : ""}
            </p>
            <p className="text-[11px] whitespace-nowrap text-ink-300">
              {formatDay(active.date)}
            </p>
          </div>
        ) : null}
      </div>

      {/* Accès non visuel aux mêmes valeurs. */}
      <table className="sr-only">
        <caption>Signatures par jour sur les quatorze derniers jours</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Signatures</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatDay(point.date)}</th>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
