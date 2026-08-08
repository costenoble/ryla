"use server";

import { recordAudit } from "@/lib/audit";
import { requestContext, requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { issueAccessToken } from "@/lib/magic-link";
import { getTemplate } from "@/lib/repos/forms";
import { createSubmission, markSent } from "@/lib/repos/submissions";

/**
 * Envoi d'un document à un patient.
 *
 * Le lien produit n'est affiché qu'une fois, dans la réponse de cette action.
 * Il ne passe ni par l'URL ni par un paramètre de redirection : un jeton dans
 * la barre d'adresse finit dans l'historique du navigateur et dans les
 * journaux des intermédiaires.
 *
 * Ce fichier vit délibérément hors de `src/app/(praticien)/…` plutôt que
 * colocalisé avec la page qui l'utilise. Une Server Action définie dans un
 * dossier de route imbriqué sous un groupe de routes portant un layout
 * asynchrone (ici, `(praticien)/layout.tsx` et son `requireSession()`) ne
 * s'exécute jamais sur Vercel : le clic redirige silencieusement vers
 * `/connexion` sans qu'aucune ligne de la fonction ne soit atteinte — vérifié
 * par une écriture inconditionnelle en tout début de fonction, qui n'a jamais
 * eu lieu. La même action, déplacée ici, fonctionne normalement. Toute
 * nouvelle action doit suivre ce même emplacement.
 */

export type NewSubmissionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "created";
      url: string;
      submissionId: string;
      patientName: string;
      expiresAt: string;
    };

export async function createAndSend(
  _previous: NewSubmissionState,
  formData: FormData,
): Promise<NewSubmissionState> {
  const session = await requireSession();
  const client = await requestContext();

  const templateId = String(formData.get("templateId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!templateId) return { status: "error", message: "Choisissez un document." };
  if (!firstName || !lastName) {
    return { status: "error", message: "Renseignez le nom et le prénom du patient." };
  }

  try {
    const result = await withTenant(
      { tenantId: session.tenant.id, actorId: session.user.id },
      async (tx) => {
        const template = await getTemplate(tx, templateId);
        if (!template?.currentVersionId) {
          throw new Error("Ce modèle n'a pas de version publiée.");
        }

        // Rapprochement sur nom + prénom + date de naissance : suffisant pour
        // une saisie au comptoir, et sans créer de doublon à chaque envoi.
        const [existing] = await tx<{ id: string }[]>`
          select id from patients
          where lower(last_name) = lower(${lastName})
            and lower(first_name) = lower(${firstName})
            and (${birthDate || null}::date is null or birth_date = ${birthDate || null}::date)
            and deleted_at is null
          limit 1
        `;

        let patientId = existing?.id;
        if (!patientId) {
          const [created] = await tx<{ id: string }[]>`
            insert into patients (tenant_id, first_name, last_name, birth_date, email)
            values (${session.tenant.id}, ${firstName}, ${lastName},
                    ${birthDate || null}, ${email || null})
            returning id
          `;
          patientId = created?.id;
        }

        const submissionId = await createSubmission(tx, {
          tenantId: session.tenant.id,
          templateId: template.id,
          formVersionId: template.currentVersionId,
          patientId: patientId ?? null,
          createdBy: session.user.id,
          assignedTo: session.user.id,
        });
        await markSent(tx, submissionId);

        const token = await issueAccessToken(tx, {
          tenantId: session.tenant.id,
          tenantSlug: session.tenant.slug,
          submissionId,
        });

        await recordAudit(tx, session.tenant.id, {
          actorType: "user",
          actorId: session.user.id,
          actorLabel: session.user.fullName,
          action: "submission.sent",
          objectType: "submission",
          objectId: submissionId,
          ip: client.ip,
          userAgent: client.userAgent,
          // Ni le jeton ni son empreinte : le journal d'audit est consultable
          // depuis l'interface, il ne doit pas permettre de rejouer un lien.
          metadata: { template: template.key, patient: `${firstName} ${lastName}` },
        });

        return {
          url: token.url,
          submissionId,
          expiresAt: token.expiresAt.toISOString(),
        };
      },
    );

    // Pas de revalidatePath() ici : ces deux pages sont déjà en
    // `force-dynamic`, elles relisent la base à chaque navigation — l'appel
    // serait sans effet utile. Il a en revanche un effet nuisible bien réel :
    // régénérer une page protégée par (praticien)/layout.tsx en arrière-plan
    // exécute son propre requireSession(), hors du contexte de cookies de la
    // requête en cours. Ce second appel échoue, et le redirect() qu'il déclenche
    // écrase la réponse de l'action — l'utilisateur atterrit sur /connexion
    // alors que l'envoi a réussi. Diagnostiqué en traçant chaque étape de
    // loadSession() : la session était bien résolue une première fois avec
    // succès, suivie d'un second appel sans aucun cookie.

    return {
      status: "created",
      patientName: `${firstName} ${lastName}`,
      ...result,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "L'envoi a échoué.",
    };
  }
}
