import { describe, expect, it } from "vitest";
import { assertCan, can, CAPABILITIES, Forbidden, type Role } from "./permissions";

/**
 * Ces tests décrivent un partage de responsabilités dans un cabinet, pas une
 * hiérarchie. Ils sont écrits en négatif là où ça compte : c'est l'absence de
 * droit qui protège une donnée de santé, et une régression silencieuse
 * ouvrirait tous les dossiers à tout le monde sans qu'aucune page ne casse.
 */

describe("droits par rôle", () => {
  it("donne tous les droits au titulaire", () => {
    for (const capability of CAPABILITIES) {
      expect(can("owner", capability)).toBe(true);
    }
  });

  it("interdit à l'assistante la lecture des données de santé", () => {
    // Le secret médical n'est pas une affaire de confiance envers la personne,
    // c'est une affaire de périmètre.
    expect(can("assistant", "health.read")).toBe(false);
  });

  it("laisse l'assistante travailler au comptoir", () => {
    // Lui interdire ça rendrait le produit inutilisable en accueil.
    expect(can("assistant", "patients.write")).toBe(true);
    expect(can("assistant", "submissions.send")).toBe(true);
    expect(can("assistant", "quotes.write")).toBe(true);
  });

  it("réserve les réglages et l'effacement au titulaire", () => {
    // Les mentions légales et le contact DPO engagent le responsable de
    // traitement ; l'effacement RGPD est une décision, pas une manipulation.
    for (const role of ["practitioner", "assistant"] as Role[]) {
      expect(can(role, "settings.write")).toBe(false);
      expect(can(role, "patients.erase")).toBe(false);
    }
  });

  it("donne au praticien l'accès clinique complet", () => {
    expect(can("practitioner", "health.read")).toBe(true);
    expect(can("practitioner", "templates.write")).toBe(true);
    expect(can("practitioner", "nomenclature.write")).toBe(true);
  });

  it("n'accorde jamais un droit hors de la liste connue", () => {
    // Garde-fou contre l'ajout d'une capacité qu'on oublierait d'attribuer :
    // le défaut doit être « refusé », jamais « autorisé ».
    for (const role of ["owner", "practitioner", "assistant"] as Role[]) {
      expect(can(role, "inconnue" as never)).toBe(false);
    }
  });

  it("lève une erreur explicite plutôt qu'un refus muet", () => {
    expect(() => assertCan("assistant", "health.read")).toThrow(Forbidden);
    expect(() => assertCan("owner", "health.read")).not.toThrow();

    try {
      assertCan("assistant", "settings.write");
    } catch (error) {
      // Le message doit dire quoi faire, pas seulement que c'est interdit.
      expect((error as Error).message).toContain("titulaire");
    }
  });
});
