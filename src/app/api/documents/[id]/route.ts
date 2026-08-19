import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { currentSession, requestContext } from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { withTenant } from "@/lib/db";
import { can } from "@/lib/permissions";
import { documentStore } from "@/lib/storage";

/**
 * Téléchargement d'un document signé.
 *
 * Deux points qui ne sont pas du confort :
 *  • l'accès est journalisé — un PDF de consentement est une donnée de santé,
 *    et savoir qui l'a consulté fait partie des obligations de traçabilité ;
 *  • l'empreinte est revérifiée à la lecture. Si le fichier a bougé dans le
 *    stockage depuis la signature, il ne doit pas être servi comme s'il faisait
 *    toujours preuve.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Un PDF de consentement est une donnée de santé : le rôle décide, pas la
  // seule présence d'une session.
  if (!can(session.user.role, "health.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const client = await requestContext();

  // La lecture du contenu se fait dans la même transaction que la recherche :
  // le pilote PostgreSQL s'appuie sur le contexte de tenant pour ne servir que
  // les documents du cabinet courant.
  const result = await withTenant(
    { tenantId: session.tenant.id, actorId: session.user.id },
    async (tx) => {
      const [row] = await tx<
        {
          filename: string;
          storage_key: string;
          sha256: string;
          content_type: string;
          submission_id: string | null;
        }[]
      >`
        select filename, storage_key, sha256, content_type, submission_id
        from documents where id = ${id}
      `;
      if (!row) return { status: "not_found" as const };

      await recordAudit(tx, session.tenant.id, {
        actorType: "user",
        actorId: session.user.id,
        actorLabel: session.user.fullName,
        action: "document.downloaded",
        objectType: "document",
        objectId: id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { filename: row.filename, submissionId: row.submission_id },
      });

      let bytes: Buffer;
      try {
        bytes = await documentStore(tx, session.tenant.id).get(row.storage_key);
      } catch {
        return { status: "unavailable" as const };
      }

      return { status: "ok" as const, document: row, bytes };
    },
  );

  if (result.status === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "unavailable") {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });
  }

  const { document, bytes } = result;

  if (sha256Hex(bytes) !== document.sha256) {
    return NextResponse.json({ error: "integrity_check_failed" }, { status: 409 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": document.content_type,
      "content-disposition": `inline; filename="${document.filename}"`,
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
