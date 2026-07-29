/**
 * Crée une session praticien et affiche la valeur de cookie correspondante.
 * Utile pour inspecter l'espace praticien avec curl, sans passer par le
 * formulaire de connexion.
 *
 *   npx tsx scripts/dev-session.ts [slug-cabinet]
 */
import { loadEnv } from "./load-env";

loadEnv();

import { db, withPrivileged, withTenant } from "../src/lib/db";
import { createSession } from "../src/lib/session";

const slug = process.argv[2] ?? "cabinet-martin";

try {
  const [tenant] = await withPrivileged(
    (sql) => sql<{ id: string }[]>`select id from app.resolve_tenant_by_slug(${slug})`,
  );
  if (!tenant) throw new Error(`Cabinet « ${slug} » introuvable.`);

  const cookie = await withTenant({ tenantId: tenant.id }, async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      select id from users where role = 'owner' limit 1
    `;
    if (!user) throw new Error("Aucun praticien dans ce cabinet.");
    const session = await createSession(tx, {
      tenantId: tenant.id,
      tenantSlug: slug,
      userId: user.id,
    });
    return session.cookieValue;
  });

  console.log(cookie);
} finally {
  await db().end();
}
