/**
 * Captures d'écran de l'interface.
 *
 * Sert à relire le rendu réel plutôt que le code qui est censé le produire :
 * une classe mal orthographiée ne fait échouer aucun test, elle fait juste une
 * interface fade. À lancer contre un serveur déjà démarré.
 *
 *   npx tsx scripts/screenshots.ts [http://localhost:3000] [dossier-de-sortie]
 */
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { loadEnv } from "./load-env";

loadEnv();

import { db, withPrivileged, withTenant } from "../src/lib/db";
import { issueAccessToken } from "../src/lib/magic-link";
import { createSession } from "../src/lib/session";
import { getTemplateByKey } from "../src/lib/repos/forms";
import { createSubmission, markSent } from "../src/lib/repos/submissions";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const outDir = process.argv[3] ?? "./screenshots";
const SLUG = "cabinet-martin";

async function shoot(page: Page, name: string, path: string, fullPage = true) {
  // Pas de `networkidle` : Next garde des connexions ouvertes, l'attente ne se
  // résout jamais. On attend le DOM, puis les polices, puis les animations.
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage });
  console.log(`  ✓ ${name}.png  ${path}`);
}

try {
  await mkdir(outDir, { recursive: true });

  const [tenant] = await withPrivileged(
    (sql) => sql<{ id: string }[]>`select id from app.resolve_tenant_by_slug(${SLUG})`,
  );
  if (!tenant) throw new Error("Lancez npm run db:seed d'abord.");

  const { cookie, portalUrl } = await withTenant({ tenantId: tenant.id }, async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      select id from users where role = 'owner' limit 1
    `;
    const session = await createSession(tx, {
      tenantId: tenant.id,
      tenantSlug: SLUG,
      userId: user!.id,
    });

    const template = await getTemplateByKey(tx, "anamnese-dentaire");
    const [patient] = await tx<{ id: string }[]>`select id from patients limit 1`;
    const submissionId = await createSubmission(tx, {
      tenantId: tenant.id,
      templateId: template!.id,
      formVersionId: template!.currentVersionId!,
      patientId: patient?.id ?? null,
    });
    await markSent(tx, submissionId);
    const token = await issueAccessToken(tx, {
      tenantId: tenant.id,
      tenantSlug: SLUG,
      submissionId,
    });

    return { cookie: session.cookieValue, portalUrl: `/p/${token.rawToken}` };
  });

  const browser = await chromium.launch();
  const host = new URL(baseUrl);

  // --- Écrans praticien, poste de bureau ------------------------------------
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
    locale: "fr-FR",
  });
  await desktop.addCookies([
    { name: "ryla_session", value: cookie, domain: host.hostname, path: "/" },
  ]);
  const page = await desktop.newPage();

  console.log("\nEspace praticien");
  await shoot(page, "01-tableau-de-bord", "/tableau-de-bord");
  await shoot(page, "02-dossiers", "/dossiers");

  // On vise un dossier signé : une fiche vide ne montre ni le bandeau de
  // vigilance ni le dossier de preuve, c'est-à-dire l'essentiel de l'écran.
  const signed = await withTenant({ tenantId: tenant.id }, (tx) =>
    tx<{ id: string }[]>`
      select id from submissions
      where status = 'signed'
      order by vigilance_count desc, signed_at desc
      limit 1
    `,
  );
  if (signed[0]) await shoot(page, "03-dossier-detail", `/dossiers/${signed[0].id}`);

  await shoot(page, "04-devis", "/devis");
  await shoot(page, "05-modeles", "/modeles");
  await desktop.close();

  // --- Connexion, sans session ----------------------------------------------
  const anon = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
    locale: "fr-FR",
  });
  const anonPage = await anon.newPage();
  console.log("\nConnexion");
  await shoot(anonPage, "06-connexion", "/connexion", false);
  await anon.close();

  // --- Portail patient, sur téléphone ---------------------------------------
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
  });
  const mobilePage = await mobile.newPage();
  console.log("\nPortail patient (390 px)");
  await shoot(mobilePage, "07-portail-mobile", portalUrl);
  await mobile.close();

  // --- Portail patient, sur ordinateur --------------------------------------
  const wide = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: "fr-FR",
  });
  const widePage = await wide.newPage();
  console.log("\nPortail patient (1280 px)");
  await shoot(widePage, "08-portail-bureau", portalUrl);
  await wide.close();

  await browser.close();
  console.log(`\nCaptures écrites dans ${outDir}\n`);
} catch (error) {
  console.error("\nÉchec :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db().end();
}
