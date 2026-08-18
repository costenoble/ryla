import type { Tx } from "../db";
import type { TenantBranding } from "../tenant";

/**
 * Fiche du cabinet courant.
 *
 * Pas de paramètre `tenantId` : le RLS restreint déjà `tenants` à la seule
 * ligne du cabinet en contexte. Passer l'identifiant donnerait l'illusion que
 * c'est lui qui filtre.
 */

export type TenantSelf = {
  id: string;
  slug: string;
  name: string;
  specialty: "dentaire" | "esthetique" | "mixte";
  legalName: string | null;
  siret: string | null;
  finess: string | null;
  address: Record<string, string>;
  branding: TenantBranding;
  dpoContact: Record<string, string>;
  legalNotice: string | null;
};

/**
 * Champs modifiables depuis les réglages.
 *
 * Ni `slug` ni `specialty` : le premier porte les liens déjà envoyés aux
 * patients, le second détermine la bibliothèque et le régime de devis. Les
 * changer depuis une page de réglages casserait des liens en cours ou
 * ferait basculer un cabinet de régime juridique sans qu'il le demande.
 */
export type TenantSettingsInput = {
  name: string;
  legalName: string | null;
  siret: string | null;
  finess: string | null;
  address: Record<string, string>;
  branding: TenantBranding;
  dpoContact: Record<string, string>;
  legalNotice: string | null;
};

export async function updateTenantSelf(
  tx: Tx,
  input: TenantSettingsInput,
): Promise<void> {
  // Pas de `where id = …` : le RLS restreint déjà `tenants` à la ligne du
  // cabinet en contexte, et sa politique d'UPDATE porte le même `with check`.
  await tx`
    update tenants set
      name = ${input.name},
      legal_name = ${input.legalName},
      siret = ${input.siret},
      finess = ${input.finess},
      address = ${tx.json(input.address as never)},
      branding = ${tx.json(input.branding as never)},
      dpo_contact = ${tx.json(input.dpoContact as never)},
      legal_notice = ${input.legalNotice},
      updated_at = now()
  `;
}

export async function getTenantSelf(tx: Tx): Promise<TenantSelf> {
  const [row] = await tx<
    {
      id: string;
      slug: string;
      name: string;
      specialty: TenantSelf["specialty"];
      legal_name: string | null;
      siret: string | null;
      finess: string | null;
      address: Record<string, string>;
      branding: TenantBranding;
      dpo_contact: Record<string, string>;
      legal_notice: string | null;
    }[]
  >`
    select id, slug, name, specialty, legal_name, siret, finess, address, branding,
           dpo_contact, legal_notice
    from tenants
  `;

  if (!row) throw new Error("Cabinet introuvable (contexte de tenant absent ?).");

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    specialty: row.specialty,
    legalName: row.legal_name,
    siret: row.siret,
    finess: row.finess,
    address: row.address ?? {},
    branding: row.branding ?? {},
    dpoContact: row.dpo_contact ?? {},
    legalNotice: row.legal_notice,
  };
}

export function formatAddress(address: Record<string, string>): string | null {
  const parts = [
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(" "),
  ].filter((part) => part && part.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : null;
}
