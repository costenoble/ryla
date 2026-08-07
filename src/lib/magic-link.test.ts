import { afterEach, describe, expect, it } from "vitest";
import { buildPortalUrl } from "./magic-link";

/**
 * Construction du lien patient.
 *
 * Bug réel rencontré en production : sur l'alias `ryla-one.vercel.app`, le
 * lien généré valait `https://cabinet-ryla.ryla-one.vercel.app/p/…` — un
 * sous-domaine que Vercel ne route pas (il ne sert que l'alias exact
 * configuré). Le lien était créé sans erreur, mais n'ouvrait jamais.
 *
 * Le sous-domaine par cabinet n'a de sens que derrière un vrai domaine
 * personnalisé au DNS générique (`*.ryla.fr`), jamais sur l'hôte partagé
 * d'une plateforme.
 */

const KEYS = ["APP_BASE_URL", "APP_TENANT_DOMAIN"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("buildPortalUrl", () => {
  it("ne construit pas de sous-domaine sur un hôte de plateforme partagé", () => {
    delete process.env.APP_TENANT_DOMAIN;
    process.env.APP_BASE_URL = "https://ryla-one.vercel.app/";

    const url = buildPortalUrl("cabinet-ryla", "abc123");

    expect(url).toBe("https://ryla-one.vercel.app/p/abc123");
    expect(url).not.toContain("cabinet-ryla.");
  });

  it("construit un sous-domaine par cabinet derrière un domaine personnalisé", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    process.env.APP_BASE_URL = "https://ryla.fr";

    const url = buildPortalUrl("cabinet-martin", "abc123");

    expect(url).toBe("https://cabinet-martin.ryla.fr/p/abc123");
  });

  it("retire le www éventuel avant de préfixer le sous-domaine", () => {
    process.env.APP_TENANT_DOMAIN = "ryla.fr";
    process.env.APP_BASE_URL = "https://www.ryla.fr";

    const url = buildPortalUrl("cabinet-martin", "abc123");

    expect(url).toBe("https://cabinet-martin.ryla.fr/p/abc123");
  });

  it("reste sur l'hôte courant en local, sans domaine personnalisé", () => {
    delete process.env.APP_TENANT_DOMAIN;
    process.env.APP_BASE_URL = "http://localhost:3000";

    const url = buildPortalUrl("cabinet-martin", "abc123");

    expect(url).toBe("http://localhost:3000/p/abc123");
  });
});
