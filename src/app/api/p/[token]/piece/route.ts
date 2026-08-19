import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { requestContext } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { resolveAccessToken } from "@/lib/magic-link";
import { documentStore } from "@/lib/storage";

/**
 * Pièce à signer, servie au porteur d'un lien magique valide.
 *
 * C'est la seule route qui délivre un document de santé sans session
 * praticien. Trois garde-fous, et ils comptent :
 *  • le jeton est résolu par le même chemin que le portail — expiré, révoqué
 *    ou épuisé, il ne donne rien ;
 *  • la pièce servie est celle référencée par *ce* dossier, pas un
 *    identifiant passé dans l'URL : un jeton ne peut donc pas servir à lire le
 *    document d'un autre patient ;
 *  • la consultation est journalisée, comme tout accès à une donnée de santé.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const resolution = await resolveAccessToken(token);

  if (!resolution.ok) {
    return NextResponse.json(
      { error: "link_invalid", reason: resolution.reason },
      { status: 404 },
    );
  }

  const { tenantId, submissionId } = resolution.token;
  const client = await requestContext();

  const result = await withTenant({ tenantId }, async (tx) => {
    const [row] = await tx<
      { filename: string; storage_key: string; content_type: string }[]
    >`
      select d.filename, d.storage_key, d.content_type
      from submissions s
      join documents d on d.id = s.source_document_id
      where s.id = ${submissionId}
    `;
    if (!row) return null;

    await recordAudit(tx, tenantId, {
      actorType: "patient",
      action: "document.viewed_by_patient",
      objectType: "submission",
      objectId: submissionId,
      ip: client.ip,
      userAgent: client.userAgent,
      metadata: { filename: row.filename },
    });

    try {
      return {
        bytes: await documentStore(tx, tenantId).get(row.storage_key),
        contentType: row.content_type,
        filename: row.filename,
      };
    } catch {
      return null;
    }
  });

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "content-type": result.contentType,
      "content-disposition": `inline; filename="${result.filename}"`,
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
