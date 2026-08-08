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

  try {
    return unwrapDek(Buffer.from(row.dek_wrapped));
  } catch (cause) {
    // Node dit seulement « Unsupported state or unable to authenticate data »,
    // ce qui n'oriente vers rien. En pratique la cause est presque toujours la
    // même : le cabinet a été créé avec une KEK, l'application tourne avec une
    // autre. Le symptôme est déroutant parce que tout le reste fonctionne —
    // connexion, navigation, listes — et que seule la première manipulation de
    // données de santé échoue.
    throw new Error(
      `Impossible de déchiffrer la clé du cabinet ${tenantId}. ` +
        `RYLA_KEK ne correspond pas à celle utilisée lors de sa création. ` +
        `Voir scripts/rewrap-dek.mjs pour re-sceller la clé sans perte.`,
      { cause },
    );
  }
}
