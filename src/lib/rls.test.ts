import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit, verifyAuditChain } from "./audit";
import { generateDek, wrapDek } from "./crypto";
import { documentStore } from "./storage";
import {
  checkRlsEnforcement,
  db,
  usesTransactionPooler,
  withPrivileged,
  withTenant,
  type Db,
} from "./db";

/**
 * Tests d'isolation multi-tenant.
 *
 * C'est le test le plus important du projet. Tout le reste peut se réécrire ;
 * une fuite entre deux cabinets ne se rattrape pas. Ces cas s'exécutent contre
 * une vraie base, avec le vrai rôle applicatif — les mocks ne prouveraient
 * rien sur des politiques évaluées par Postgres.
 *
 * Prérequis : ./scripts/pg.sh start && npm run db:migrate
 */

const suffix = Date.now().toString(36);
const slugA = `test-a-${suffix}`;
const slugB = `test-b-${suffix}`;

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

beforeAll(async () => {
  admin = postgres(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "", {
    max: 1,
    onnotice: () => {},
  });

  tenantA = await provision(slugA, "Cabinet A");
  tenantB = await provision(slugB, "Cabinet B");

  await withTenant({ tenantId: tenantA }, async (tx) => {
    await tx`
      insert into patients (tenant_id, first_name, last_name)
      values (${tenantA}, 'Alice', 'Alpha')
    `;
  });
  await withTenant({ tenantId: tenantB }, async (tx) => {
    await tx`
      insert into patients (tenant_id, first_name, last_name)
      values (${tenantB}, 'Bruno', 'Beta')
    `;
  });
});

afterAll(async () => {
  // Le rôle applicatif n'a pas le droit de supprimer un cabinet : le ménage
  // passe par le rôle propriétaire, ce qui est en soi une bonne nouvelle.
  await admin`delete from tenants where slug in (${slugA}, ${slugB})`;
  await admin.end();
  await db().end();
});

describe("isolation par Row Level Security", () => {
  it("ne montre à un cabinet que ses propres patients", async () => {
    const namesA = await withTenant({ tenantId: tenantA }, (tx) =>
      tx<{ first_name: string }[]>`select first_name from patients`,
    );
    const namesB = await withTenant({ tenantId: tenantB }, (tx) =>
      tx<{ first_name: string }[]>`select first_name from patients`,
    );

    expect(namesA.map((r) => r.first_name)).toEqual(["Alice"]);
    expect(namesB.map((r) => r.first_name)).toEqual(["Bruno"]);
  });

  it("ne montre rien du tout sans contexte de tenant", async () => {
    // Échec fermé : oublier de poser le contexte ne donne pas « tout voir »,
    // ça donne « ne rien voir ».
    const rows = await withPrivileged(
      (sql) => sql<{ count: string }[]>`select count(*) as count from patients`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it("empêche d'écrire une ligne au nom d'un autre cabinet", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, async (tx) => {
        await tx`
          insert into patients (tenant_id, first_name, last_name)
          values (${tenantB}, 'Intrus', 'Malveillant')
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("empêche de déplacer une ligne vers un autre cabinet", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, async (tx) => {
        await tx`update patients set tenant_id = ${tenantB} where first_name = 'Alice'`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("ne laisse pas un cabinet lire la fiche d'un autre", async () => {
    const rows = await withTenant(
      { tenantId: tenantA },
      (tx) => tx<{ slug: string }[]>`select slug from tenants`,
    );
    expect(rows.map((r) => r.slug)).toEqual([slugA]);
  });

  it("libère le contexte à la fin de la transaction", async () => {
    await withTenant({ tenantId: tenantA }, async (tx) => {
      await tx`select 1`;
    });
    // La connexion retourne au pool : le contexte ne doit pas la suivre.
    const rows = await withPrivileged(
      (sql) => sql<{ tenant: string | null }[]>`
        select nullif(current_setting('app.tenant_id', true), '') as tenant
      `,
    );
    expect(rows[0]?.tenant).toBeNull();
  });
});

describe("garde-fou de connexion", () => {
  it("accepte le rôle applicatif", async () => {
    await expect(checkRlsEnforcement(db())).resolves.toBeUndefined();
  });

  it("refuse un rôle superuser ou BYPASSRLS", async () => {
    await expect(checkRlsEnforcement(admin as Db)).rejects.toThrow(/contourne le RLS/);
  });

  it("refuse un rôle propriétaire de tables, même sans privilège particulier", async () => {
    // Le scénario exact des bases managées : `DATABASE_URL` pointe sur le rôle
    // qui a joué les migrations. Il n'est ni superuser ni BYPASSRLS — mais
    // PostgreSQL exempte le propriétaire du RLS, et l'isolation disparaîtrait
    // sans le moindre message d'erreur.
    await admin.unsafe(`
      drop table if exists public.rls_probe_table;
      drop role if exists rls_probe;
      create role rls_probe login nosuperuser nocreatedb nocreaterole nobypassrls;
      create table public.rls_probe_table (id int);
      alter table public.rls_probe_table owner to rls_probe;
      alter table public.rls_probe_table enable row level security;
    `);

    const probeUrl = new URL(process.env.DATABASE_URL ?? "");
    probeUrl.username = "rls_probe";
    probeUrl.password = "";
    const probe = postgres(probeUrl.toString(), { max: 1, onnotice: () => {} });

    try {
      await expect(checkRlsEnforcement(probe as Db)).rejects.toThrow(
        /propriétaire de \d+ table/,
      );
    } finally {
      await probe.end();
      await admin.unsafe(`
        drop table if exists public.rls_probe_table;
        drop role if exists rls_probe;
      `);
    }
  });

  it("désactive les instructions préparées derrière un pooler en mode transaction", () => {
    expect(
      usesTransactionPooler("postgres://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"),
    ).toBe(true);
    expect(usesTransactionPooler("postgres://u:p@db.projet.supabase.co:5432/postgres")).toBe(
      false,
    );
    expect(usesTransactionPooler("postgres://ryla_app@localhost:54329/ryla")).toBe(false);
  });
});

describe("stockage des documents", () => {
  it("cloisonne les documents entre cabinets", async () => {
    const key = `${tenantA}/test/${suffix}/consentement.pdf`;
    const content = Buffer.from("%PDF-1.7 contenu de test");

    await withTenant({ tenantId: tenantA }, async (tx) => {
      const stored = await documentStore(tx, tenantA).put(key, content);
      expect(stored.byteSize).toBe(content.byteLength);
      const read = await documentStore(tx, tenantA).get(key);
      expect(read.equals(content)).toBe(true);
    });

    // Même clé exacte, autre cabinet : le RLS ne renvoie aucune ligne. Un
    // identifiant de document qui fuiterait ne donnerait donc rien.
    await expect(
      withTenant({ tenantId: tenantB }, (tx) => documentStore(tx, tenantB).get(key)),
    ).rejects.toThrow(/introuvable/);
  });
});

describe("journal d'audit", () => {
  it("chaîne les entrées et vérifie leur intégrité", async () => {
    const status = await withTenant({ tenantId: tenantA }, async (tx) => {
      await recordAudit(tx, tenantA, {
        actorType: "system",
        action: "test.first",
        objectType: "patient",
      });
      await recordAudit(tx, tenantA, {
        actorType: "system",
        action: "test.second",
        objectType: "patient",
      });
      return verifyAuditChain(tx, tenantA);
    });

    expect(status.valid).toBe(true);
    expect(status.entries).toBe(2);
    expect(status.head).toBeTruthy();
  });

  it("refuse la modification et la suppression au rôle applicatif", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, async (tx) => {
        await tx`update audit_log set action = 'falsifie'`;
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withTenant({ tenantId: tenantA }, async (tx) => {
        await tx`delete from audit_log`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("détecte une falsification faite en contournant l'application", async () => {
    // Scénario réel : quelqu'un avec un accès base direct réécrit une ligne
    // pour antidater un consentement. La chaîne doit le révéler.
    await admin`
      update audit_log set action = 'action-reecrite'
      where tenant_id = ${tenantA} and action = 'test.first'
    `;

    const status = await withTenant({ tenantId: tenantA }, (tx) =>
      verifyAuditChain(tx, tenantA),
    );

    expect(status.valid).toBe(false);
    expect(status.brokenAt).toBeTruthy();
  });
});

/**
 * Le référentiel d'actes est la seule table dont la lecture s'ouvre au-delà du
 * cabinet courant : la CCAM est un texte réglementaire, pas une donnée de
 * cabinet. Cette ouverture ne doit surtout pas s'étendre à l'écriture — un
 * cabinet qui pourrait réécrire une ligne partagée la casserait pour tous les
 * autres, en silence.
 */
describe("référentiel d'actes", () => {
  let sharedId = "";

  beforeAll(async () => {
    const [row] = await admin<{ id: string }[]>`
      insert into nomenclature (system, code, label, specialty, source)
      values ('CCAM', ${`PART-${suffix}`}, 'Acte de référence', 'commun', 'test')
      returning id
    `;
    sharedId = row!.id;

    await withTenant({ tenantId: tenantA }, async (tx) => {
      await tx`
        insert into nomenclature (tenant_id, system, code, label, specialty)
        values (${tenantA}, 'CCAM', ${`PROPRE-${suffix}`}, 'Acte du cabinet A', 'commun')
      `;
    });
  });

  afterAll(async () => {
    await admin`delete from nomenclature where code like ${`%${suffix}`}`;
  });

  it("montre la référence partagée à tous les cabinets", async () => {
    for (const tenantId of [tenantA, tenantB]) {
      const rows = await withTenant({ tenantId }, (tx) =>
        tx<{ code: string }[]>`
          select code from nomenclature where code = ${`PART-${suffix}`}
        `,
      );
      expect(rows).toHaveLength(1);
    }
  });

  it("ne montre pas à un cabinet les actes d'un autre", async () => {
    const rows = await withTenant({ tenantId: tenantB }, (tx) =>
      tx<{ code: string }[]>`
        select code from nomenclature where code = ${`PROPRE-${suffix}`}
      `,
    );
    expect(rows).toHaveLength(0);
  });

  it("refuse de modifier une ligne du référentiel partagé", async () => {
    // Silencieusement sans effet plutôt qu'en erreur : le prédicat `using` de
    // la politique de mise à jour rend simplement la ligne invisible à
    // l'écriture. C'est ce que l'action applicative détecte pour proposer une
    // copie plutôt qu'une modification.
    const rows = await withTenant({ tenantId: tenantA }, (tx) =>
      tx<{ id: string }[]>`
        update nomenclature set label = 'détourné'
        where id = ${sharedId} returning id
      `,
    );
    expect(rows).toHaveLength(0);

    const [check] = await admin<{ label: string }[]>`
      select label from nomenclature where id = ${sharedId}
    `;
    expect(check?.label).toBe("Acte de référence");
  });

  it("refuse de supprimer une ligne du référentiel partagé", async () => {
    const rows = await withTenant({ tenantId: tenantA }, (tx) =>
      tx<{ id: string }[]>`delete from nomenclature where id = ${sharedId} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("refuse de créer un acte au nom d'un autre cabinet", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, async (tx) => {
        await tx`
          insert into nomenclature (tenant_id, system, code, label, specialty)
          values (${tenantB}, 'CCAM', ${`VOLE-${suffix}`}, 'Acte volé', 'commun')
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
