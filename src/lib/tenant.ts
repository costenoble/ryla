import { withPrivileged } from "./db";
import { env } from "./env";

/**
 * Résolution du cabinet.
 *
 * En production chaque cabinet a son sous-domaine — c'est le support du
 * branding, mais surtout des mentions légales et du contact DPO qui lui sont
 * propres : c'est lui le responsable de traitement, Ryla n'est que
 * sous-traitant au sens de l'article 28 du RGPD.
 */

export type TenantBranding = {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  senderName?: string;
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  specialty: "dentaire" | "esthetique" | "mixte";
  branding: TenantBranding;
  legalNotice: string | null;
};

export async function resolveTenantBySlug(
  slug: string,
): Promise<TenantSummary | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return null;

  const rows = await withPrivileged(
    (sql) => sql<
      {
        id: string;
        slug: string;
        name: string;
        specialty: TenantSummary["specialty"];
        branding: TenantBranding;
        legal_notice: string | null;
      }[]
    >`select * from app.resolve_tenant_by_slug(${slug})`,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    specialty: row.specialty,
    branding: row.branding ?? {},
    legalNotice: row.legal_notice,
  };
}

/**
 * Liste des cabinets, pour le sélecteur de l'écran de connexion local.
 *
 * En production le cabinet vient du sous-domaine : cette liste ne doit jamais
 * être servie, d'où le verrou sur l'environnement plutôt qu'une simple
 * condition d'affichage côté page. Demander à quelqu'un de deviner un
 * identifiant interne pour se connecter est une impasse ; lui proposer la
 * liste en local règle le problème sans rien exposer ailleurs.
 */
export async function listTenantsForLogin(): Promise<
  { slug: string; name: string }[]
> {
  // Hors développement, la liste des cabinets ne s'affiche que si on l'a
  // explicitement demandé — le temps d'une démonstration sur un domaine
  // Vercel, avant que chaque cabinet ait son sous-domaine.
  if (env.isProduction && !env.showTenantPicker) return [];

  try {
    return await withPrivileged(
      (sql) => sql<{ slug: string; name: string }[]>`select * from app.list_tenants()`,
    );
  } catch {
    // Base injoignable ou migration 0004 non appliquée : on retombe sur le
    // champ libre plutôt que de faire échouer la page de connexion.
    return [];
  }
}

/**
 * Extrait le slug du cabinet depuis l'en-tête Host.
 *
 * Renvoie null en local (localhost, IP) : le développement passe alors par le
 * slug saisi à la connexion plutôt que par un sous-domaine.
 */
export function tenantSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const rootDomain = (env.tenantDomain.split(":")[0] ?? "").toLowerCase();
  if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    const slug = hostname.slice(0, -(rootDomain.length + 1));
    return slug && !slug.includes(".") && slug !== "www" ? slug : null;
  }

  // Aucun repli sur « le premier label d'un hôte à trois étiquettes ».
  //
  // Ça paraissait raisonnable et c'était faux : sur `ryla-one.vercel.app`,
  // `ryla-one` est le nom du projet, pas un cabinet. L'application cherchait
  // alors un cabinet inexistant et répondait « Identifiants incorrects » quels
  // que soient les identifiants, sans champ pour corriger le tir.
  //
  // Un slug ne se devine pas : il vient d'un sous-domaine du domaine configuré,
  // ou il est saisi.
  return null;
}
