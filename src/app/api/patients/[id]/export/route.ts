import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { currentSession, requestContext } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { can } from "@/lib/permissions";
import { buildPatientExport } from "@/lib/repos/patient-export";
import { getTenantSelf } from "@/lib/repos/tenants";

/**
 * Export des données d'un patient — article 20 du RGPD.
 *
 * L'export contient des données de santé : il exige le même droit que la
 * lecture d'un dossier, et il est journalisé comme tel. Une demande de
 * portabilité est un accès, pas une opération neutre.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!can(session.user.role, "health.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const client = await requestContext();

  const data = await withTenant(
    { tenantId: session.tenant.id, actorId: session.user.id },
    async (tx) => {
      const tenant = await getTenantSelf(tx);
      const payload = await buildPatientExport(tx, session.tenant.id, tenant.name, id);
      if (!payload) return null;

      await recordAudit(tx, session.tenant.id, {
        actorType: "user",
        actorId: session.user.id,
        actorLabel: session.user.fullName,
        action: "patient.exported",
        objectType: "patient",
        objectId: id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { submissions: payload.submissions.length },
      });

      return payload;
    },
  );

  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const filename = `ryla-export-${id}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
