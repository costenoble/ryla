import { unwrapDek } from "../crypto";
import type { Tx } from "../db";

/**
 * Récupère la clé de chiffrement du cabinet, déchiffrée en mémoire.
 *
 * Volontairement sans cache : la clé ne survit pas à la requête. Le coût d'un
 * déchiffrement AES d'une clé de 32 octets est négligeable devant l'aller-retour
 * base — ça ne vaut pas le risque de laisser traîner des clés de plusieurs
 * cabinets dans un processus partagé.
 */
export async function loadTenantDek(tx: Tx, tenantId: string): Promise<Buffer> {
  const [row] = await tx<{ dek_wrapped: Uint8Array }[]>`
    select dek_wrapped from tenants where id = ${tenantId}
  `;
  if (!row) {
    // Contexte RLS absent ou cabinet inconnu — les deux sont des erreurs de
    // programmation, pas des cas métier.
    throw new Error("Clé du cabinet introuvable (contexte de tenant absent ?).");
  }
  return unwrapDek(Buffer.from(row.dek_wrapped));
}
