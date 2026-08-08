/**
 * Re-scelle la clé de chiffrement d'un cabinet avec une autre KEK.
 *
 * Cas d'usage réel : le cabinet a été créé par un SQL généré avec une KEK, et
 * l'application tourne avec une autre. Le symptôme est net et déroutant —
 * « Unsupported state or unable to authenticate data » à la première lecture
 * ou écriture de données de santé, alors que tout le reste fonctionne.
 *
 * La clé du cabinet (DEK) elle-même reste identique : seule son enveloppe
 * change. Aucune donnée déjà chiffrée ne devient illisible, contrairement à
 * une régénération de clé.
 *
 *   node scripts/rewrap-dek.mjs <dek_wrapped_hex> <ancienne_kek_b64> <nouvelle_kek_b64> [slug]
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const [hex, oldKekB64, newKekB64, slug = "cabinet-ryla"] = process.argv.slice(2);

if (!hex || !oldKekB64 || !newKekB64) {
  console.error(
    "Usage : node scripts/rewrap-dek.mjs <dek_wrapped_hex> <ancienne_kek_b64> <nouvelle_kek_b64> [slug]",
  );
  process.exit(1);
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function unwrap(wrapped, kek) {
  const decipher = createDecipheriv("aes-256-gcm", kek, wrapped.subarray(0, IV_BYTES));
  decipher.setAuthTag(wrapped.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(wrapped.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
}

function wrap(dek, kek) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

const wrapped = Buffer.from(hex, "hex");
const oldKek = Buffer.from(oldKekB64, "base64");
const newKek = Buffer.from(newKekB64, "base64");

if (oldKek.length !== 32 || newKek.length !== 32) {
  console.error("Les deux KEK doivent faire 32 octets une fois décodées (base64).");
  process.exit(1);
}

let dek;
try {
  dek = unwrap(wrapped, oldKek);
} catch {
  console.error(
    "L'ancienne KEK ne déchiffre pas cette clé. Vérifiez que c'est bien celle\n" +
      "qui a servi à créer le cabinet.",
  );
  process.exit(1);
}

const rewrapped = wrap(dek, newKek);

// Contrôle : la nouvelle enveloppe doit rendre exactement la même clé.
if (!unwrap(rewrapped, newKek).equals(dek)) {
  console.error("Le re-scellement n'est pas réversible — abandon.");
  process.exit(1);
}

console.log("-- Re-scelle la clé du cabinet avec la nouvelle KEK.");
console.log("-- La clé de chiffrement elle-même est inchangée : rien ne devient illisible.");
console.log(`update tenants set dek_wrapped = '\\x${rewrapped.toString("hex")}'::bytea`);
console.log(`where slug = '${slug}';`);
