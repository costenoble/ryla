import { describe, expect, it } from "vitest";
import { matchPatient } from "./patient-match";

/**
 * Ces cas décrivent une erreur qu'on ne rattrape pas : les réponses de santé
 * d'une personne versées au dossier d'une autre. Ils sont donc écrits du point
 * de vue du risque, pas de la commodité.
 */
describe("rapprochement d'un patient", () => {
  const martin1 = { id: "p1", birthDate: "1980-04-12" };
  const martin2 = { id: "p2", birthDate: "1994-11-03" };

  it("rapproche sur la date de naissance quand elle est fournie", () => {
    expect(matchPatient([martin1, martin2], "1994-11-03")).toEqual({
      kind: "matched",
      patientId: "p2",
    });
  });

  it("crée un dossier quand la date ne correspond à aucun homonyme", () => {
    // Une date qui ne correspond à rien désigne quelqu'un d'autre, pas une
    // faute de frappe à rattraper en silence.
    expect(matchPatient([martin1, martin2], "2001-01-01")).toEqual({ kind: "create" });
  });

  it("refuse de choisir entre deux homonymes sans date de naissance", () => {
    // C'est le cas qui fusionnait deux personnes auparavant.
    expect(matchPatient([martin1, martin2], null)).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("rapproche sans date quand un seul dossier porte ce nom", () => {
    expect(matchPatient([martin1], null)).toEqual({ kind: "matched", patientId: "p1" });
  });

  it("crée un dossier quand personne ne porte ce nom", () => {
    expect(matchPatient([], null)).toEqual({ kind: "create" });
    expect(matchPatient([], "1980-04-12")).toEqual({ kind: "create" });
  });

  it("ne rapproche pas un dossier sans date sur une date fournie", () => {
    // Un dossier incomplet ne doit pas absorber une identité mieux renseignée.
    expect(matchPatient([{ id: "p3", birthDate: null }], "1980-04-12")).toEqual({
      kind: "create",
    });
  });
});
