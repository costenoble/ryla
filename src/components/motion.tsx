"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Primitives d'animation.
 *
 * Trois principes, tenus partout :
 *  • Le mouvement sert à expliquer, pas à décorer. Une carte monte de quelques
 *    pixels parce qu'elle arrive ; elle ne flotte pas en boucle.
 *  • 150 à 320 ms, jamais plus. Au-delà, l'interface donne l'impression de
 *    ramer — l'inverse de l'effet recherché.
 *  • `prefers-reduced-motion` est respecté : les composants rendent alors
 *    l'état final, sans transition. Ce n'est pas une option, c'est un réglage
 *    système que des gens activent pour de vraies raisons.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

// ---------------------------------------------------------------------------
// Apparition
// ---------------------------------------------------------------------------

export function FadeUp({
  children,
  delay = 0,
  y = 12,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const listVariants: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
};

/**
 * Décale l'apparition des enfants.
 *
 * L'effet n'est pas gratuit : le décalage donne au regard un ordre de lecture,
 * ce qui compte sur un tableau de bord où six tuiles arrivent en même temps.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={listVariants}
      initial={reduced ? false : "hidden"}
      animate="shown"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** Apparition au défilement, déclenchée une seule fois. */
export function RevealOnScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={inView || reduced ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Survol
// ---------------------------------------------------------------------------

/**
 * Léger soulèvement au survol.
 *
 * Uniquement sur les éléments réellement cliquables — un survol qui réagit sur
 * une carte inerte est un mensonge d'affordance.
 */
export function HoverLift({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Chiffres
// ---------------------------------------------------------------------------

/**
 * Compteur animé.
 *
 * Chiffres proportionnels par défaut : `tabular-nums` donne à chaque chiffre la
 * largeur d'un zéro, ce qui fait paraître un grand nombre étrangement espacé.
 * On ne passe en tabulaire que dans une colonne, là où l'alignement vertical
 * prime — d'où l'option plutôt qu'un choix imposé.
 */
export function CountUp({
  value,
  duration = 0.9,
  suffix = "",
  decimals = 0,
  tabular = false,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
  tabular?: boolean;
}) {
  const reduced = useReducedMotion();
  const count = useMotionValue(reduced ? value : 0);
  const text = useTransform(count, (latest) =>
    latest.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  );

  useEffect(() => {
    if (reduced) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [value, duration, reduced, count]);

  return (
    <span className={tabular ? "tabular" : undefined}>
      <motion.span>{text}</motion.span>
      {suffix}
    </span>
  );
}

/** Barre de progression qui se remplit à l'affichage. */
export function ProgressBar({
  value,
  className,
  barClassName = "bg-brand-600",
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-line ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={`h-full rounded-full ${barClassName}`}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.85, ease: EASE, delay: 0.15 }}
      />
    </div>
  );
}
