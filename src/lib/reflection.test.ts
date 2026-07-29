import { describe, expect, it } from "vitest";
import {
  addDays,
  checkAcceptanceAllowed,
  computeReflectionWindow,
  REFLECTION_DAYS_ESTHETIQUE,
} from "./reflection";

const remise = new Date("2026-07-01T10:00:00.000Z");

describe("délai de réflexion", () => {
  it("dure quinze jours en chirurgie esthétique", () => {
    expect(REFLECTION_DAYS_ESTHETIQUE).toBe(15);
    const window = computeReflectionWindow({
      days: REFLECTION_DAYS_ESTHETIQUE,
      startsAt: remise,
      now: remise,
    });
    expect(window.endsAt?.toISOString()).toBe("2026-07-16T10:00:00.000Z");
  });

  it("bloque l'acceptation à J+12", () => {
    // Le cas qui rend un praticien indéfendable : opérer avant l'expiration.
    const check = checkAcceptanceAllowed({
      days: 15,
      startsAt: remise,
      now: addDays(remise, 12),
    });
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("D6322-30");
      expect(check.availableAt?.toISOString()).toBe("2026-07-16T10:00:00.000Z");
    }
  });

  it("bloque encore une heure avant l'échéance", () => {
    const check = checkAcceptanceAllowed({
      days: 15,
      startsAt: remise,
      now: new Date("2026-07-16T09:00:00.000Z"),
    });
    expect(check.allowed).toBe(false);
  });

  it("autorise l'acceptation une fois le délai écoulé", () => {
    const check = checkAcceptanceAllowed({
      days: 15,
      startsAt: remise,
      now: new Date("2026-07-16T10:00:00.000Z"),
    });
    expect(check.allowed).toBe(true);
  });

  it("refuse tant que le devis n'a pas été remis", () => {
    const check = checkAcceptanceAllowed({ days: 15, startsAt: null });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toContain("pas encore été remis");
  });

  it("ne bloque rien quand aucun délai n'est requis", () => {
    expect(checkAcceptanceAllowed({ days: 0, startsAt: null }).allowed).toBe(true);
  });

  it("arrondit le décompte au jour supérieur", () => {
    const window = computeReflectionWindow({
      days: 15,
      startsAt: remise,
      now: new Date("2026-07-15T22:00:00.000Z"),
    });
    // Il reste 12 heures : on affiche « 1 jour », jamais « 0 ».
    expect(window.remainingDays).toBe(1);
    expect(window.elapsed).toBe(false);
  });
});
