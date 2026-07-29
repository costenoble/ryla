import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/**
 * Primitives cryptographiques de Ryla.
 *
 * Modèle de chiffrement en enveloppe :
 *   KEK (maître, en KMS)  ->  DEK (une par cabinet, stockée chiffrée)
 *                         ->  réponses de santé (AES-256-GCM)
 *
 * Conséquence pratique : révoquer un cabinet, c'est détruire sa DEK. Et une
 * fuite de la base seule ne donne aucune donnée de santé lisible.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

export type EncryptedBlob = {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
};

function kekBytes(): Buffer {
  const key = Buffer.from(env.kek, "base64");
  if (key.length !== 32) {
    throw new Error("RYLA_KEK doit faire 32 octets une fois décodé (base64).");
  }
  return key;
}

function encryptWith(key: Buffer, plaintext: Buffer): EncryptedBlob {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decryptWith(key: Buffer, blob: EncryptedBlob): Buffer {
  const decipher = createDecipheriv(ALGO, key, blob.iv);
  decipher.setAuthTag(blob.tag);
  return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Clés de cabinet
// ---------------------------------------------------------------------------

export function generateDek(): Buffer {
  return randomBytes(32);
}

/** Sérialise en `iv | tag | ciphertext` pour tenir dans une seule colonne. */
export function wrapDek(dek: Buffer): Buffer {
  const { ciphertext, iv, tag } = encryptWith(kekBytes(), dek);
  return Buffer.concat([iv, tag, ciphertext]);
}

export function unwrapDek(wrapped: Buffer): Buffer {
  const iv = wrapped.subarray(0, IV_BYTES);
  const tag = wrapped.subarray(IV_BYTES, IV_BYTES + 16);
  const ciphertext = wrapped.subarray(IV_BYTES + 16);
  return decryptWith(kekBytes(), { iv, tag, ciphertext });
}

// ---------------------------------------------------------------------------
// Données de santé
// ---------------------------------------------------------------------------

export function encryptJson(dek: Buffer, value: unknown): EncryptedBlob {
  return encryptWith(dek, Buffer.from(JSON.stringify(value), "utf8"));
}

export function decryptJson<T>(dek: Buffer, blob: EncryptedBlob): T {
  return JSON.parse(decryptWith(dek, blob).toString("utf8")) as T;
}

// ---------------------------------------------------------------------------
// Empreintes
// ---------------------------------------------------------------------------

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * JSON canonique : clés triées récursivement.
 *
 * Indispensable pour que le hash d'un document ou d'un jeu de réponses soit
 * reproductible — sans ça, deux sérialisations du même contenu donnent deux
 * empreintes différentes et la preuve ne vaut rien.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortDeep(source[key]);
    }
    return out;
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

// ---------------------------------------------------------------------------
// Jetons (liens magiques, sessions)
// ---------------------------------------------------------------------------

/** Jeton opaque de 256 bits, sûr en URL. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Empreinte stockée en base. HMAC plutôt que SHA-256 nu : une fuite de la
 * table `access_tokens` ne permet pas de retrouver les jetons par force brute
 * sans le secret applicatif, qui lui ne vit pas dans la base.
 */
export function hashToken(raw: string): string {
  return createHmac("sha256", env.tokenSecret).update(raw).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Mots de passe praticien
// ---------------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expectedBuf = Buffer.from(expected, "base64");
  const derived = scryptSync(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64"),
    expectedBuf.length,
    { N: Number(n), r: Number(r), p: Number(p) },
  );
  return timingSafeEqual(derived, expectedBuf);
}
