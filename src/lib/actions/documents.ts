"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { issueAccessToken, revokeTokensForSubmission } from "@/lib/magic-link";
import { getSubmission } from "@/lib/repos/submissions";

/**
 * Renvoi du lien d'un document déjà envoyé.
 *
 * Le lien précédent est révoqué avant d'en émettre un nouveau. C'est
 * délibéré : un patient qui a perdu son lien n'en veut qu'un seul valide, et
 * laisser traîner des liens actifs multiplie les portes d'entrée vers son
 * dossier sans rien apporter.
 */

export type ResendState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; url: string; expiresAt: string };

export async function resendDocumentLink(
  _previous: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const session = await requireSession();
  const client = await requestContext();
  const submissionId = String(formData.get("submissionId") ?? "").trim();

  if (!submissionId) return { status: "error", message: "Document introuvable." };

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const submission = await getSubmission(tx, submissionId);
        if (!submission) throw new Error("Document introuvable.");

        // Un document signé est figé : rouvrir un lien dessus laisserait croire
        // qu'il peut encore être modifié, ce qui n'est pas le cas.
        if (submission.status === "signed") {
          throw new Error("Ce document est déjà signé — son lien reste désactivé.");
        }

        await revokeTokensForSubmission(tx, submissionId);

        const token = await issueAccessToken(tx, {
          tenantId: session.tenant.id,
          tenantSlug: session.tenant.slug,
          submissionId,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "submission.link_reissued",
          objectType: "submission",
          objectId: submissionId,
          ip: client.ip,
          userAgent: client.userAgent,
          // Ni le jeton ni son empreinte : le journal est consultable depuis
          // l'interface, il ne doit pas permettre de rejouer un lien.
          metadata: { template: submission.templateKey },
        });

        return { url: token.url, expiresAt: token.expiresAt.toISOString() };
      },
    );

    return { status: "sent", ...result };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Le renvoi a échoué.",
    };
  }
}
