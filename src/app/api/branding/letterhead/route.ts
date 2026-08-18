import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { getTenantSelf } from "@/lib/repos/tenants";
import { documentStore } from "@/lib/storage";

/**
 * Image d'en-tête du cabinet.
 *
 * Servie au praticien pour l'aperçu des réglages et du devis. Pas de route
 * publique : l'en-tête part dans les PDF générés, où il est embarqué côté
 * serveur — il n'y a aucune raison qu'un tiers puisse le récupérer à l'unité
 * et s'en servir pour fabriquer un faux document au nom du cabinet.
 */
export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const tenant = await getTenantSelf(tx);
    const key = tenant.branding.letterheadImageKey;
    if (!key) return null;

    try {
      const bytes = await documentStore(tx, session.tenant.id).get(key);
      return { bytes, type: tenant.branding.letterheadImageType ?? "image/png" };
    } catch {
      return null;
    }
  });

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "content-type": result.type,
      // Privé : c'est l'identité visuelle d'un cabinet, pas un actif public.
      "cache-control": "private, max-age=60",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
