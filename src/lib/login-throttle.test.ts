import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDek, wrapDek } from "./crypto";
import { db, withPrivileged, withTenant } from "./db";
import {
  checkLoginThrottle,
  clearLoginFailures,
  decideThrottle,
  MAX_FAILURES_PER_EMAIL,
  MAX_FAILURES_PER_IP,
  recordLoginFailure,
  THROTTLE_WINDOW_MINUTES,
  throttleMessage,
} from "./login-throttle";

/**
 * Le cœur de la décision se teste sans base : ce sont les seuils et le calcul
 * du délai restant qui doivent être justes. Les compteurs, eux, s'appuient sur
 * du SQL et sur le RLS, donc ils se vérifient contre une vraie base — un
 * compteur qui déborderait d'un cabinet à l'autre bloquerait des praticiens
 * innocents.
 */

describe("décision de limitation", () => {
  const base = {
    emailFailures: 0,
    ipFailures: 0,
    oldestEmailAttempt: null,
    oldestIpAttempt: null,
  };

  it("laisse passer sous les seuils", () => {
    expect(
      decideThrottle({
        ...base,
        emailFailures: MAX_FAILURES_PER_EMAIL - 1,
        ipFailures: MAX_FAILURES_PER_IP - 1,
      }).allowed,
    ).toBe(true);
  });

  it("bloque au seuil par email", () => {
    const decision = decideThrottle({
      ...base,
      emailFailures: MAX_FAILURES_PER_EMAIL,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe("email");
  });

  it("bloque au seuil par IP, même si aucun compte n'est visé plusieurs fois", () => {
    const decision = decideThrottle({ ...base, ipFailures: MAX_FAILURES_PER_IP });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe("ip");
  });

  it("fait primer le périmètre email sur le périmètre IP", () => {
    const decision = decideThrottle({
      ...base,
      emailFailures: MAX_FAILURES_PER_EMAIL,
      ipFailures: MAX_FAILURES_PER_IP,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe("email");
  });

  it("compte le délai restant depuis la plus ancienne tentative de la fenêtre", () => {
    const now = new Date("2026-08-18T12:00:00Z");
    // Tentative la plus ancienne à T-10 min : elle sort de la fenêtre de 15 min
    // dans 5 minutes.
    const decision = decideThrottle({
      ...base,
      emailFailures: MAX_FAILURES_PER_EMAIL,
      oldestEmailAttempt: new Date("2026-08-18T11:50:00Z"),
      now,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.retryAfterSeconds).toBe(5 * 60);
  });

  it("ne renvoie jamais un délai nul, qui se lirait « c'est ouvert »", () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const decision = decideThrottle({
      ...base,
      emailFailures: MAX_FAILURES_PER_EMAIL,
      // Déjà sortie de la fenêtre : le compteur est en retard d'un instant.
      oldestEmailAttempt: new Date("2026-08-18T11:00:00Z"),
      now,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("annonce une attente en minutes, arrondie au supérieur", () => {
    expect(
      throttleMessage({ allowed: false, scope: "email", retryAfterSeconds: 61 }),
    ).toContain("2 minutes");
    expect(
      throttleMessage({ allowed: false, scope: "email", retryAfterSeconds: 30 }),
    ).toContain("1 minute");
  });

  it("retombe sur la fenêtre entière quand aucune date n'est connue", () => {
    const decision = decideThrottle({
      ...base,
      emailFailures: MAX_FAILURES_PER_EMAIL,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.retryAfterSeconds).toBe(THROTTLE_WINDOW_MINUTES * 60);
  });
});

// ---------------------------------------------------------------------------

const suffix = Date.now().toString(36);
const slugA = `throttle-a-${suffix}`;
const slugB = `throttle-b-${suffix}`;

let tenantA = "";
let tenantB = "";
let admin: postgres.Sql;

async function provision(slug: string, name: string): Promise<string> {
  const rows = await withPrivileged(
    (sql) => sql<{ provision_tenant: string }[]>`
      select app.provision_tenant(${slug}, ${name}, 'mixte', ${wrapDek(generateDek())})
    `,
  );
  const id = rows[0]?.provision_tenant;
  if (!id) throw new Error("Provisionnement impossible.");
  return id;
}

describe("compteurs en base", () => {
  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "", {
      max: 1,
      onnotice: () => {},
    });
    tenantA = await provision(slugA, "Cabinet Throttle A");
    tenantB = await provision(slugB, "Cabinet Throttle B");
  });

  afterAll(async () => {
    await admin`delete from tenants where slug in (${slugA}, ${slugB})`;
    await admin.end();
    await db().end();
  });

  it("bloque après le nombre d'échecs prévu sur un même email", async () => {
    await withTenant({ tenantId: tenantA }, async (tx) => {
      for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i += 1) {
        expect(
          (await checkLoginThrottle(tx, { email: "praticien@exemple.fr", ip: "10.0.0.1" }))
            .allowed,
        ).toBe(true);
        await recordLoginFailure(tx, tenantA, {
          email: "praticien@exemple.fr",
          ip: "10.0.0.1",
        });
      }

      const decision = await checkLoginThrottle(tx, {
        email: "praticien@exemple.fr",
        ip: "10.0.0.1",
      });
      expect(decision.allowed).toBe(false);
    });
  });

  it("normalise la casse : PRATICIEN@… et praticien@… sont le même compteur", async () => {
    await withTenant({ tenantId: tenantA }, async (tx) => {
      const decision = await checkLoginThrottle(tx, {
        email: "PRATICIEN@EXEMPLE.FR",
        ip: "10.0.0.9",
      });
      expect(decision.allowed).toBe(false);
    });
  });

  it("libère le compte après une connexion réussie", async () => {
    await withTenant({ tenantId: tenantA }, async (tx) => {
      await clearLoginFailures(tx, "praticien@exemple.fr");
      const decision = await checkLoginThrottle(tx, {
        email: "praticien@exemple.fr",
        ip: "10.0.0.1",
      });
      expect(decision.allowed).toBe(true);
    });
  });

  it("ne fait pas déborder le compteur d'un cabinet sur un autre", async () => {
    await withTenant({ tenantId: tenantA }, async (tx) => {
      for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i += 1) {
        await recordLoginFailure(tx, tenantA, { email: "commun@exemple.fr", ip: "10.0.0.2" });
      }
      const blocked = await checkLoginThrottle(tx, {
        email: "commun@exemple.fr",
        ip: "10.0.0.2",
      });
      expect(blocked.allowed).toBe(false);
    });

    // Même email, même IP, autre cabinet : le RLS doit rendre le compteur
    // invisible, donc la connexion reste ouverte.
    await withTenant({ tenantId: tenantB }, async (tx) => {
      const decision = await checkLoginThrottle(tx, {
        email: "commun@exemple.fr",
        ip: "10.0.0.2",
      });
      expect(decision.allowed).toBe(true);
    });
  });

  it("compte par IP même quand chaque compte n'encaisse qu'un essai", async () => {
    await withTenant({ tenantId: tenantB }, async (tx) => {
      for (let i = 0; i < MAX_FAILURES_PER_IP; i += 1) {
        await recordLoginFailure(tx, tenantB, {
          email: `cible-${i}@exemple.fr`,
          ip: "10.0.0.3",
        });
      }

      // Un email jamais essayé, depuis la même adresse : bloqué quand même.
      const decision = await checkLoginThrottle(tx, {
        email: "jamais-vu@exemple.fr",
        ip: "10.0.0.3",
      });
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.scope).toBe("ip");
    });
  });

  it("ne compte pas les tentatives sans adresse IP comme une même origine", async () => {
    await withTenant({ tenantId: tenantB }, async (tx) => {
      for (let i = 0; i < MAX_FAILURES_PER_IP; i += 1) {
        await recordLoginFailure(tx, tenantB, { email: `anon-${i}@exemple.fr`, ip: null });
      }
      // IP inconnue des deux côtés : le compteur par IP ne doit pas s'appliquer,
      // sinon un proxy mal configuré bloquerait tout le monde d'un coup.
      const decision = await checkLoginThrottle(tx, {
        email: "encore-un@exemple.fr",
        ip: null,
      });
      expect(decision.allowed).toBe(true);
    });
  });
});
