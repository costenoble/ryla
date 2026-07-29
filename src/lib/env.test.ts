import { afterEach, describe, expect, it } from "vitest";
import { env } from "./env";

/**
 * `APP_BASE_URL` construit les liens envoyés aux patients. Une valeur fausse
 * ne casse aucun build et ne lève aucune erreur : elle produit simplement des
 * liens que personne ne peut ouvrir. D'où ces cas.
 */

const KEYS = [
  "APP_BASE_URL",
  "APP_TENANT_DOMAIN",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clear() {
  for (const key of KEYS) delete process.env[key];
}

describe("appBaseUrl", () => {
  it("privilégie APP_BASE_URL sur tout le reste", () => {
    clear();
    process.env.APP_BASE_URL = "https://ryla.fr";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ryla.vercel.app";
    expect(env.appBaseUrl).toBe("https://ryla.fr");
  });

  it("retombe sur le domaine de production Vercel", () => {
    clear();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ryla.vercel.app";
    expect(env.appBaseUrl).toBe("https://ryla.vercel.app");
  });

  it("préfère le domaine de production à celui du déploiement", () => {
    // VERCEL_URL change à chaque mise en ligne : un lien patient émis avant un
    // déploiement pointerait vers une URL morte.
    clear();
    process.env.VERCEL_URL = "ryla-abc123-ryan.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ryla.vercel.app";
    expect(env.appBaseUrl).toBe("https://ryla.vercel.app");
  });

  it("utilise VERCEL_URL en dernier recours", () => {
    clear();
    process.env.VERCEL_URL = "ryla-abc123-ryan.vercel.app";
    expect(env.appBaseUrl).toBe("https://ryla-abc123-ryan.vercel.app");
  });

  it("retombe sur localhost hors plateforme", () => {
    clear();
    expect(env.appBaseUrl).toBe("http://localhost:3000");
    expect(env.tenantDomain).toBe("localhost:3000");
  });

  it("expose le domaine sans protocole pour les sous-domaines de cabinet", () => {
    clear();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ryla.vercel.app";
    expect(env.tenantDomain).toBe("ryla.vercel.app");
  });
});
