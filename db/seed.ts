/**
 * Jeu de démonstration.
 *
 * Deux cabinets, un par verticale, pour vérifier de bout en bout que
 * l'isolation tient : mêmes modèles, mêmes écrans, aucune donnée commune.
 *
 * Le seed passe par le rôle applicatif et par `withTenant()` — donc soumis au
 * RLS, comme la production. Si une politique est mal écrite, le seed échoue,
 * et c'est exactement ce qu'on veut.
 */
import { loadEnv } from "../scripts/load-env";

loadEnv();

import { generateDek, hashPassword, wrapDek } from "../src/lib/crypto";
import { db, withPrivileged, withTenant } from "../src/lib/db";
import { parseFormDefinition } from "../src/lib/form-schema";
import { librarySelection } from "../src/lib/library";
import { issueAccessToken } from "../src/lib/magic-link";
import { createTemplate, getTemplateByKey } from "../src/lib/repos/forms";
import { createQuote, deliverQuote } from "../src/lib/repos/quotes";
import { createSubmission, markSent } from "../src/lib/repos/submissions";
import { recordAudit } from "../src/lib/audit";
import { REFLECTION_DAYS_ESTHETIQUE } from "../src/lib/reflection";

const DEMO_PASSWORD = "ryla-demo-2026";

type TenantSpec = {
  slug: string;
  name: string;
  specialty: "dentaire" | "esthetique" | "mixte";
  legalName: string;
  siret: string;
  address: Record<string, string>;
  branding: Record<string, string>;
  dpoContact: Record<string, string>;
  users: {
    email: string;
    fullName: string;
    role: "owner" | "practitioner" | "assistant";
    rpps: string;
    specialityLabel: string;
  }[];
  patients: {
    firstName: string;
    lastName: string;
    birthDate: string;
    email: string;
    phone: string;
  }[];
};

const TENANTS: TenantSpec[] = [
  {
    slug: "cabinet-martin",
    name: "Cabinet dentaire Martin",
    specialty: "dentaire",
    legalName: "SELARL Cabinet Dentaire Martin",
    siret: "84291736500018",
    address: {
      street: "12 rue des Capucins",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
    },
    branding: {
      primaryColor: "#2563EB",
      accentColor: "#EA580C",
      senderName: "Cabinet dentaire Martin",
    },
    dpoContact: { name: "Sophie Martin", email: "dpo@cabinet-martin.test" },
    users: [
      {
        email: "sophie.martin@cabinet-martin.test",
        fullName: "Dr Sophie Martin",
        role: "owner",
        rpps: "10003456789",
        specialityLabel: "Chirurgien-dentiste — implantologie",
      },
      {
        email: "accueil@cabinet-martin.test",
        fullName: "Camille Roux",
        role: "assistant",
        rpps: "",
        specialityLabel: "Assistant(e) dentaire",
      },
    ],
    patients: [
      {
        firstName: "Julien",
        lastName: "Bertrand",
        birthDate: "1979-03-14",
        email: "julien.bertrand@example.test",
        phone: "+33600000001",
      },
      {
        firstName: "Nadia",
        lastName: "Lemoine",
        birthDate: "1992-11-02",
        email: "nadia.lemoine@example.test",
        phone: "+33600000002",
      },
    ],
  },
  {
    slug: "clinique-lumiere",
    name: "Clinique Lumière",
    specialty: "esthetique",
    legalName: "SAS Clinique Lumière",
    siret: "91038475600024",
    address: {
      street: "48 avenue Victor Hugo",
      postalCode: "75116",
      city: "Paris",
      country: "France",
    },
    branding: {
      primaryColor: "#7C3AED",
      accentColor: "#EA580C",
      senderName: "Clinique Lumière",
    },
    dpoContact: { name: "Délégué à la protection des données", email: "dpo@clinique-lumiere.test" },
    users: [
      {
        email: "antoine.vidal@clinique-lumiere.test",
        fullName: "Dr Antoine Vidal",
        role: "owner",
        rpps: "10009876543",
        specialityLabel: "Chirurgie plastique et esthétique",
      },
    ],
    patients: [
      {
        firstName: "Élodie",
        lastName: "Fournier",
        birthDate: "1988-06-21",
        email: "elodie.fournier@example.test",
        phone: "+33600000003",
      },
    ],
  },
];

// ---------------------------------------------------------------------------

async function resolveOrProvision(spec: TenantSpec): Promise<string> {
  const existing = await withPrivileged(
    (sql) => sql<{ id: string }[]>`
      select id from app.resolve_tenant_by_slug(${spec.slug})
    `,
  );
  if (existing[0]) return existing[0].id;

  const wrapped = wrapDek(generateDek());
  const rows = await withPrivileged(
    (sql) => sql<{ provision_tenant: string }[]>`
      select app.provision_tenant(
        ${spec.slug}, ${spec.name}, ${spec.specialty}, ${wrapped}
      )
    `,
  );
  const id = rows[0]?.provision_tenant;
  if (!id) throw new Error(`Provisionnement impossible pour ${spec.slug}.`);
  return id;
}

async function seedTenant(spec: TenantSpec): Promise<string[]> {
  const tenantId = await resolveOrProvision(spec);
  const output: string[] = [];

  await withTenant({ tenantId }, async (tx) => {
    await tx`
      update tenants set
        legal_name = ${spec.legalName},
        siret = ${spec.siret},
        address = ${tx.json(spec.address as never)},
        branding = ${tx.json(spec.branding as never)},
        dpo_contact = ${tx.json(spec.dpoContact as never)},
        legal_notice = ${
          `${spec.legalName} — ${spec.address.street}, ${spec.address.postalCode} ` +
          `${spec.address.city}. Responsable de traitement. Contact DPO : ${spec.dpoContact.email}.`
        }
      where id = ${tenantId}
    `;

    // --- Utilisateurs ------------------------------------------------------
    const passwordHash = hashPassword(DEMO_PASSWORD);
    let ownerId: string | null = null;

    for (const user of spec.users) {
      const [row] = await tx<{ id: string }[]>`
        insert into users (
          tenant_id, email, password_hash, full_name, role, rpps, speciality_label
        ) values (
          ${tenantId}, ${user.email}, ${passwordHash}, ${user.fullName},
          ${user.role}, ${user.rpps || null}, ${user.specialityLabel}
        )
        on conflict (tenant_id, lower(email)) do update
          set full_name = excluded.full_name
        returning id
      `;
      if (user.role === "owner" && row) ownerId = row.id;
    }

    // --- Patients ----------------------------------------------------------
    const patientIds: string[] = [];
    for (const patient of spec.patients) {
      const [existing] = await tx<{ id: string }[]>`
        select id from patients
        where lower(last_name) = lower(${patient.lastName})
          and lower(first_name) = lower(${patient.firstName})
        limit 1
      `;
      if (existing) {
        patientIds.push(existing.id);
        continue;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into patients (
          tenant_id, first_name, last_name, birth_date, email, phone
        ) values (
          ${tenantId}, ${patient.firstName}, ${patient.lastName},
          ${patient.birthDate}, ${patient.email}, ${patient.phone}
        )
        returning id
      `;
      if (row) patientIds.push(row.id);
    }

    // --- Bibliothèque de modèles ------------------------------------------
    for (const entry of librarySelection(spec.specialty)) {
      if (await getTemplateByKey(tx, entry.key)) continue;
      const definition = parseFormDefinition(entry.definition);
      await createTemplate(tx, {
        tenantId,
        key: entry.key,
        title: definition.title,
        description: definition.intro ?? null,
        kind: entry.kind,
        specialty: entry.specialty,
        libraryRef: entry.libraryRef,
        definition,
        createdBy: ownerId,
      });
    }

    // --- Un dossier envoyé, avec son lien -----------------------------------
    const questionnaireKey =
      spec.specialty === "dentaire" ? "anamnese-dentaire" : "anamnese-esthetique";
    const template = await getTemplateByKey(tx, questionnaireKey);
    const patientId = patientIds[0];

    if (template?.currentVersionId && patientId) {
      const submissionId = await createSubmission(tx, {
        tenantId,
        templateId: template.id,
        formVersionId: template.currentVersionId,
        patientId,
        createdBy: ownerId,
        assignedTo: ownerId,
      });
      await markSent(tx, submissionId);

      const token = await issueAccessToken(tx, {
        tenantId,
        tenantSlug: spec.slug,
        submissionId,
      });

      await recordAudit(tx, tenantId, {
        actorType: "system",
        action: "submission.sent",
        objectType: "submission",
        objectId: submissionId,
        metadata: { seed: true, template: questionnaireKey },
      });

      output.push(`  Lien patient  : ${token.url}`);
    }

    // --- Un devis, propre à chaque verticale --------------------------------
    if (spec.specialty === "dentaire" && patientId) {
      const [exists] = await tx<{ id: string }[]>`
        select id from quotes where reference = 'DEV-2026-0001'
      `;
      if (!exists) {
        const { quoteId, remainingChargeCents } = await createQuote(tx, {
          tenantId,
          kind: "dentaire_cerfa_s3404",
          reference: "DEV-2026-0001",
          patientId,
          practitionerId: ownerId,
          validityDays: 30,
          payload: {
            practitionerName: spec.users[0]?.fullName,
            practitionerIdentifier: spec.users[0]?.rpps,
            practiceAddress: `${spec.address.street}, ${spec.address.postalCode} ${spec.address.city}`,
          },
          lines: [
            {
              description: "Couronne céramo-métallique sur dent 26",
              ccamCode: "HBLD038",
              toothNumbers: ["26"],
              careBasket: "panier_maitrise",
              material: "Céramo-métallique",
              quantity: 1,
              unitPriceCents: 50_000,
              baseReimbursementCents: 12_050,
              reimbursementRate: 0.7,
              amcCents: 20_000,
            },
            {
              description: "Couronne céramique monolithique zircone sur dent 36",
              ccamCode: "HBLD038",
              toothNumbers: ["36"],
              careBasket: "panier_100_sante",
              material: "Zircone",
              quantity: 1,
              unitPriceCents: 44_000,
              baseReimbursementCents: 12_050,
              reimbursementRate: 0.7,
            },
            {
              description: "Implant intra-osseux, secteur 46",
              ccamCode: "HBLD030",
              toothNumbers: ["46"],
              careBasket: "panier_libre",
              material: "Titane",
              quantity: 1,
              unitPriceCents: 95_000,
              baseReimbursementCents: 0,
              reimbursementRate: 0,
            },
          ],
        });
        await deliverQuote(tx, quoteId);
        output.push(
          `  Devis CERFA   : DEV-2026-0001 — reste à charge ${(
            remainingChargeCents / 100
          ).toFixed(2)} €`,
        );
      }
    }

    if (spec.specialty === "esthetique" && patientId) {
      const [exists] = await tx<{ id: string }[]>`
        select id from quotes where reference = 'DEV-2026-0100'
      `;
      if (!exists) {
        const { quoteId } = await createQuote(tx, {
          tenantId,
          kind: "esthetique",
          reference: "DEV-2026-0100",
          patientId,
          practitionerId: ownerId,
          validityDays: 90,
          reflectionPeriodDays: REFLECTION_DAYS_ESTHETIQUE,
          payload: {
            practitionerName: spec.users[0]?.fullName,
            practitionerIdentifier: spec.users[0]?.rpps,
            intervention: "Rhinoplastie primaire",
          },
          lines: [
            {
              description: "Honoraires chirurgicaux — rhinoplastie primaire",
              careBasket: null,
              quantity: 1,
              unitPriceCents: 420_000,
              baseReimbursementCents: 0,
              reimbursementRate: 0,
            },
            {
              description: "Honoraires d'anesthésie",
              quantity: 1,
              unitPriceCents: 90_000,
              baseReimbursementCents: 0,
              reimbursementRate: 0,
            },
            {
              description: "Frais de séjour — ambulatoire",
              quantity: 1,
              unitPriceCents: 110_000,
              baseReimbursementCents: 0,
              reimbursementRate: 0,
            },
          ],
        });
        const quote = await deliverQuote(tx, quoteId);
        output.push(
          `  Devis esthét. : DEV-2026-0100 — délai de réflexion jusqu'au ${
            quote.reflectionEndsAt?.toLocaleDateString("fr-FR") ?? "—"
          }`,
        );
      }
    }
  });

  return output;
}

// ---------------------------------------------------------------------------

try {
  console.log("");
  for (const spec of TENANTS) {
    const lines = await seedTenant(spec);
    console.log(`▸ ${spec.name} (${spec.slug}) — ${spec.specialty}`);
    console.log(`  Connexion     : ${spec.users[0]?.email} / ${DEMO_PASSWORD}`);
    for (const line of lines) console.log(line);
    console.log("");
  }
  console.log("Espace praticien : http://localhost:3000/connexion");
  console.log("");
} catch (error) {
  console.error("Échec du seed :");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await db().end();
}
