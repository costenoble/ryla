import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  canonicalJson,
  decryptJson,
  encryptJson,
  generateDek,
  hashPassword,
  hashToken,
  unwrapDek,
  verifyPassword,
  wrapDek,
} from "./crypto";

describe("chiffrement en enveloppe", () => {
  it("restitue la clé du cabinet après emballage", () => {
    const dek = generateDek();
    expect(unwrapDek(wrapDek(dek)).equals(dek)).toBe(true);
  });

  it("produit un chiffré différent à chaque appel", () => {
    const dek = generateDek();
    const first = encryptJson(dek, { a: 1 });
    const second = encryptJson(dek, { a: 1 });
    // IV aléatoire : deux chiffrés identiques trahiraient une réutilisation
    // d'IV, qui casse complètement GCM.
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it("refuse de déchiffrer avec la clé d'un autre cabinet", () => {
    const blob = encryptJson(generateDek(), { allergies: ["pénicilline"] });
    expect(() => decryptJson(generateDek(), blob)).toThrow();
  });

  it("détecte l'altération du chiffré", () => {
    const dek = generateDek();
    const blob = encryptJson(dek, { anticoagulant: true });
    blob.ciphertext.writeUInt8(blob.ciphertext.readUInt8(0) ^ 0xff, 0);
    expect(() => decryptJson(dek, blob)).toThrow();
  });

  it("conserve la structure des réponses", () => {
    const dek = generateDek();
    const answers = {
      nom: "Bertrand",
      pathologies: ["diabete", "asthme"],
      pacemaker: false,
      semaines: 12,
      vide: null,
    };
    expect(decryptJson(dek, encryptJson(dek, answers))).toEqual(answers);
  });
});

describe("hachage canonique", () => {
  it("ignore l'ordre des clés", () => {
    // Sans cette propriété, deux sérialisations du même dossier donneraient
    // deux empreintes différentes et la preuve ne vaudrait rien.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalHash({ x: { z: 1, y: 2 } })).toBe(canonicalHash({ x: { y: 2, z: 1 } }));
  });

  it("conserve l'ordre des tableaux", () => {
    expect(canonicalHash([1, 2])).not.toBe(canonicalHash([2, 1]));
  });

  it("change dès qu'une valeur change", () => {
    expect(canonicalHash({ tabac: true })).not.toBe(canonicalHash({ tabac: false }));
  });
});

describe("jetons", () => {
  it("hache de façon stable et distincte", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).not.toContain("abc");
  });
});

describe("mots de passe", () => {
  it("vérifie le bon mot de passe et rejette les autres", () => {
    const stored = hashPassword("ryla-demo-2026");
    expect(verifyPassword("ryla-demo-2026", stored)).toBe(true);
    expect(verifyPassword("ryla-demo-2025", stored)).toBe(false);
  });

  it("sale chaque empreinte", () => {
    expect(hashPassword("identique")).not.toBe(hashPassword("identique"));
  });

  it("rejette une empreinte malformée sans lever d'exception", () => {
    expect(verifyPassword("x", "pas-un-hash")).toBe(false);
  });
});
