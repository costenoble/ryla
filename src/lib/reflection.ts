/**
 * Délai de réflexion en chirurgie esthétique.
 *
 * Article D6322-30 du code de la santé publique : un délai minimum de quinze
 * jours doit s'écouler entre la remise du devis et l'intervention. Il est
 * d'ordre public — le patient ne peut pas y renoncer, même par écrit, même
 * s'il insiste. Un praticien qui opère à J+12 est indéfendable.
 *
 * D'où le parti pris de Ryla : le compteur ne se pilote pas depuis
 * l'interface. Il démarre à la remise du devis, et la seule chose que le
 * produit sache faire ensuite, c'est constater qu'il est écoulé — et le
 * prouver, horodatage à l'appui.
 */

export const REFLECTION_DAYS_ESTHETIQUE = 15;

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export type ReflectionWindow = {
  required: boolean;
  days: number;
  startsAt: Date | null;
  /** Instant à partir duquel le délai est écoulé (exclu). */
  endsAt: Date | null;
  elapsed: boolean;
  remainingDays: number;
  remainingMs: number;
};

export function computeReflectionWindow(params: {
  days: number;
  startsAt: Date | null;
  now?: Date;
}): ReflectionWindow {
  const now = params.now ?? new Date();
  const required = params.days > 0;

  if (!required || !params.startsAt) {
    return {
      required,
      days: params.days,
      startsAt: params.startsAt,
      endsAt: null,
      // Un délai non requis est considéré écoulé : il ne bloque rien.
      elapsed: !required,
      remainingDays: 0,
      remainingMs: 0,
    };
  }

  const endsAt = addDays(params.startsAt, params.days);
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());

  return {
    required,
    days: params.days,
    startsAt: params.startsAt,
    endsAt,
    elapsed: remainingMs === 0,
    // Arrondi au jour supérieur : « il reste 1 jour » tant qu'il reste une heure.
    remainingDays: Math.ceil(remainingMs / DAY_MS),
    remainingMs,
  };
}

export type AcceptanceCheck =
  | { allowed: true }
  | { allowed: false; reason: string; availableAt: Date | null };

/**
 * Autorise — ou non — l'acceptation d'un devis soumis à délai de réflexion.
 *
 * Appelé côté serveur avant toute acceptation. L'interface masque déjà le
 * bouton, mais c'est ce contrôle-ci qui fait foi.
 */
export function checkAcceptanceAllowed(params: {
  days: number;
  startsAt: Date | null;
  now?: Date;
}): AcceptanceCheck {
  const window = computeReflectionWindow(params);
  if (!window.required) return { allowed: true };

  if (!window.startsAt) {
    return {
      allowed: false,
      reason:
        "Le délai de réflexion n'a pas commencé : le devis n'a pas encore été remis au patient.",
      availableAt: null,
    };
  }

  if (!window.elapsed) {
    return {
      allowed: false,
      reason:
        `Délai de réflexion légal de ${window.days} jours en cours ` +
        `(art. D6322-30 CSP). Il reste ${window.remainingDays} jour(s).`,
      availableAt: window.endsAt,
    };
  }

  return { allowed: true };
}

export function formatReflectionDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
