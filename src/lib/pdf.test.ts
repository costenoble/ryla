import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "./form-schema";
import { anamneseDentaire } from "./library/dentaire";
import { renderSubmissionPdf, sanitizeForPdf } from "./pdf";

describe("sanitizeForPdf", () => {
  it("conserve les caractères WinAnsi hors Latin-1", () => {
    // Le cas qui a motivé ce test : « Œdème de Quincke » sortait « ?dème ».
    expect(sanitizeForPdf("Œdème de Quincke")).toBe("Œdème de Quincke");
    expect(sanitizeForPdf("cœur — 420 € « oui »")).toBe("cœur — 420 € « oui »");
  });

  it("conserve les accents français", () => {
    expect(sanitizeForPdf("À côté, l'anesthésie a été mal supportée"))
      .toBe("À côté, l'anesthésie a été mal supportée");
  });

  it("replie ce que WinAnsi ne sait pas encoder", () => {
    expect(sanitizeForPdf("a‑b")).toBe("a-b"); // tiret insécable
    expect(sanitizeForPdf("12 345")).toBe("12 345"); // espace fine insécable
    expect(sanitizeForPdf("你好")).toBe("??");
  });

  it("ne laisse passer aucun caractère refusé par les polices standard", async () => {
    // Garde-fou réel : si un caractère survit au nettoyage sans être encodable,
    // drawText lève, et c'est une signature qui échoue en production.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const sample = sanitizeForPdf(
      "Œdème — cœur 420 € « guillemets » ‘simples’ … † ‰ Ÿ š ž 你好 a‑b",
    );
    expect(() => font.encodeText(sample)).not.toThrow();
  });
});

describe("renderSubmissionPdf", () => {
  const definition = parseFormDefinition(anamneseDentaire);

  it("produit un PDF valide et son empreinte", async () => {
    const { bytes, sha256 } = await renderSubmissionPdf({
      definition,
      answers: {
        nom: "Bertrand",
        prenom: "Julien",
        sexe: "m",
        traitement_en_cours: true,
        liste_medicaments: "Kardégic 75 mg",
        a_des_allergies: true,
        allergies_types: ["penicilline"],
        allergies_details: "Œdème de Quincke en 2011",
        motif: "Douleur molaire",
      },
      tenant: { name: "Cabinet dentaire Martin", brandColor: "#0F5257" },
      patient: { displayName: "Julien Bertrand", birthDate: "14/03/1979" },
      signature: {
        signerName: "Julien Bertrand",
        signerRole: "patient",
        signedAt: new Date("2026-07-28T14:30:00Z"),
        statements: [
          { text: "Je certifie l'exactitude des informations.", acceptedAt: "2026-07-28T14:29:00Z" },
        ],
      },
    });

    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
  });

  it("n'imprime pas les réponses aux questions masquées", async () => {
    // sexe = m masque la question grossesse. Une réponse résiduelle ne doit
    // pas réapparaître dans le document signé.
    const { bytes } = await renderSubmissionPdf({
      definition,
      answers: { sexe: "m", grossesse: true, nom: "Bertrand" },
      tenant: { name: "Cabinet" },
      patient: { displayName: "Julien Bertrand" },
    });

    const text = Buffer.from(bytes).toString("latin1");
    expect(text).not.toContain("enceinte");
  });
});
