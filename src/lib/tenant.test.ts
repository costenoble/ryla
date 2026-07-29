import { afterEach, describe, expect, it } from "vitest";
import { tenantSlugFromHost } from "./tenant";

/**
 * Résolution du cabinet depuis l'hôte.
 *
 * Une erreur ici ne lève aucune exception : elle fait simplement chercher un
 * cabinet inexistant, et la connexion répond « Identifiants incorrects » quels
 * que soient les identifiants. C'est arrivé en production sur un domaine
 * `*.vercel.app` — d'où ces cas.
 */

const saved = process.env.APP_TENANT_DOMAIN;

afterEach(() => {
  if (saved === undefined) delete process.env.APP_TENANT_DOMAIN;
  else process.env.APP_TENANT_DOMAIN = saved;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

describe("tenantSlugFromHost", () => {
  it("extrait le slug d'un sous-domaine du domaine configuré", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    expect(tenantSlugFromHost("cabinet-martin.ryla.fr")).toBe("cabinet-martin");
    expect(tenantSlugFromHost("clinique-lumiere.ryla.fr:3000")).toBe("clinique-lumiere");
  });

  it("ignore le domaine nu et le www", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    expect(tenantSlugFromHost("ryla.fr")).toBeNull();
    expect(tenantSlugFromHost("www.ryla.fr")).toBeNull();
  });

  it("ne prend pas le nom de projet Vercel pour un cabinet", () => {
    // Le bug : `ryla-one` est le projet, pas un cabinet. L'ancien repli sur
    // « premier label d'un hôte à trois étiquettes » rendait la connexion
    // impossible, sans même afficher de champ pour se rattraper.
    delete process.env.APP_TENANT_DOMAIN;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ryla-one.vercel.app";
    expect(tenantSlugFromHost("ryla-one.vercel.app")).toBeNull();
    expect(tenantSlugFromHost("ryla-f7i9pqgwc-ryans-projects.vercel.app")).toBeNull();
  });

  it("ne devine rien sur un domaine non configuré", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    expect(tenantSlugFromHost("app.exemple.com")).toBeNull();
    expect(tenantSlugFromHost("preview.autre-domaine.net")).toBeNull();
  });

  it("renvoie null en local et sur une adresse IP", () => {
    expect(tenantSlugFromHost("localhost:3000")).toBeNull();
    expect(tenantSlugFromHost("127.0.0.1:3000")).toBeNull();
    expect(tenantSlugFromHost(null)).toBeNull();
    expect(tenantSlugFromHost(undefined)).toBeNull();
  });

  it("refuse un sous-sous-domaine", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    expect(tenantSlugFromHost("a.b.ryla.fr")).toBeNull();
  });
});
