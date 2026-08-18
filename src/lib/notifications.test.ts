import { describe, expect, it } from "vitest";
import {
  composeFrom,
  patientInvitation,
  patientReminder,
  practitionerNotification,
} from "./notifications";

/**
 * Ces tests gardent la règle qui fait l'argument commercial du produit : aucun
 * message sortant ne contient de donnée de santé. Ils sont écrits en négatif —
 * on vérifie l'absence — parce que c'est une fuite qu'on cherche à empêcher,
 * pas une fonctionnalité qu'on cherche à confirmer.
 */

const url = "https://cabinet-martin.ryla.fr/formulaire/abc123";

describe("gabarits sortants", () => {
  it("n'annonce ni motif, ni spécialité, ni type de document dans l'objet", () => {
    const message = patientInvitation({
      to: "patient@exemple.fr",
      cabinetName: "Cabinet Martin",
      url,
      expiresAt: new Date("2026-09-01T10:00:00Z"),
    });

    const forbidden = [
      "questionnaire",
      "consentement",
      "opératoire",
      "chirurgie",
      "implant",
      "esthétique",
      "devis",
      "médical",
    ];
    for (const word of forbidden) {
      expect(message.subject.toLowerCase()).not.toContain(word);
    }
  });

  it("ne nomme pas le patient dans la notification au praticien", () => {
    const message = practitionerNotification({
      to: "praticien@exemple.fr",
      dashboardUrl: "https://cabinet-martin.ryla.fr/dossiers/xyz",
      patientInitials: "JD",
    });

    expect(message.subject).toContain("JD");
    expect(message.subject.toLowerCase()).not.toContain("dupont");
    // Le contenu médical vit derrière l'authentification, pas dans la boîte
    // mail du praticien.
    expect(message.body).toContain("aucun contenu médical n'est");
  });

  it("porte le lien et rien d'autre", () => {
    const message = patientInvitation({
      to: "patient@exemple.fr",
      cabinetName: "Cabinet Martin",
      url,
      expiresAt: new Date("2026-09-01T10:00:00Z"),
    });
    expect(message.body).toContain(url);
    expect(message.body).toContain("Ne le transmettez à personne.");
  });

  it("expose le nom du cabinet comme libellé d'expéditeur", () => {
    expect(
      patientInvitation({
        to: "patient@exemple.fr",
        cabinetName: "Cabinet Martin",
        url,
        expiresAt: new Date(),
      }).senderLabel,
    ).toBe("Cabinet Martin");

    expect(
      patientReminder({ to: "p@exemple.fr", cabinetName: "Cabinet Martin", url })
        .senderLabel,
    ).toBe("Cabinet Martin");
  });
});

describe("en-tête From", () => {
  const configured = "Ryla <ne-pas-repondre@ryla.fr>";

  it("garde l'adresse configurée et ne change que le libellé", () => {
    // L'adresse doit rester dans le domaine qui porte SPF et DKIM : envoyer
    // depuis celui du cabinet ferait tomber le message en indésirable.
    expect(composeFrom(configured, "Cabinet Martin")).toBe(
      '"Cabinet Martin (via Ryla)" <ne-pas-repondre@ryla.fr>',
    );
  });

  it("retombe sur la valeur configurée sans libellé", () => {
    expect(composeFrom(configured, null)).toBe(configured);
    expect(composeFrom(configured, "   ")).toBe(configured);
  });

  it("neutralise une injection d'en-tête par le nom du cabinet", () => {
    // Le nom vient de la base et se modifie depuis les réglages : un retour
    // chariot y ajouterait un en-tête arbitraire, donc un destinataire caché.
    const composed = composeFrom(configured, 'Martin"\r\nBcc: espion@ailleurs.fr');
    expect(composed).not.toContain("\r");
    expect(composed).not.toContain("\n");
    expect(composed).not.toContain("Bcc:\n");
    expect(composed).toBe(
      '"Martin Bcc: espion@ailleurs.fr (via Ryla)" <ne-pas-repondre@ryla.fr>',
    );
  });

  it("accepte une adresse nue comme valeur configurée", () => {
    expect(composeFrom("ne-pas-repondre@ryla.fr", "Cabinet Martin")).toBe(
      '"Cabinet Martin (via Ryla)" <ne-pas-repondre@ryla.fr>',
    );
  });
});
