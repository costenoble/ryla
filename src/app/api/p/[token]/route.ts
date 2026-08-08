import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, verifyAuditChain } from "@/lib/audit";
import { requestContext } from "@/lib/auth";
import { validateAnswers } from "@/lib/branching";
import { withTenant } from "@/lib/db";
import type { Answers } from "@/lib/form-schema";
import { markTokenUsed, resolveAccessToken, revokeTokensForSubmission } from "@/lib/magic-link";
import { renderSubmissionPdf } from "@/lib/pdf";
import { buildProofBundle, normalizeDwell } from "@/lib/proof";
import { getTenantSelf, formatAddress } from "@/lib/repos/tenants";
import {
  getSubmission,
  markCompleted,
  markSigned,
  writeAnswers,
} from "@/lib/repos/submissions";
import { buildStorageKey, documentStore } from "@/lib/storage";

/**
 * API du portail patient.
 *
 * Le client peut être modifié : rien de ce qu'il envoie n'est cru sur parole.
 * La visibilité des champs est recalculée ici avec le même moteur, les
 * réponses invisibles sont écartées, et les obligations sont revalidées avant
 * toute signature.
 */

const answerValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    answers: z.record(z.string(), answerValue),
  }),
  z.object({
    action: z.literal("submit"),
    answers: z.record(z.string(), answerValue),
    signerName: z.string().min(2).max(120),
    signatureImage: z.string().max(400_000).optional().nullable(),
    statements: z.array(z.object({ id: z.string(), acceptedAt: z.string() })),
    dwell: z.array(z.object({ sectionId: z.string(), ms: z.number() })).default([]),
    locale: z.string().max(10).optional(),
    timezoneOffsetMinutes: z.number().optional().nullable(),
  }),
]);

function decodeSignatureImage(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match?.[1]) return null;
  return Buffer.from(match[1], "base64");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await context.params;
  const resolution = await resolveAccessToken(rawToken);

  if (!resolution.ok) {
    return NextResponse.json({ error: "link_invalid", reason: resolution.reason }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const body = parsed.data;
  const { tenantId, submissionId, tokenId } = resolution.token;
  const client = await requestContext();

  try {
    return await handle(body, { tenantId, submissionId, tokenId, audience: resolution.token.audience }, client);
  } catch (error) {
    // Sans ce filet, une erreur ici devient un 500 muet et le patient ne voit
    // que « L'envoi a échoué » — impossible à diagnostiquer sans accès aux
    // journaux de la plateforme. Le message reste côté serveur ; le patient
    // reçoit un code stable, jamais le détail technique.
    console.error("[portail] échec du traitement", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

async function handle(
  body: z.infer<typeof bodySchema>,
  ids: {
    tenantId: string;
    submissionId: string;
    tokenId: string;
    audience: string;
  },
  client: Awaited<ReturnType<typeof requestContext>>,
) {
  const { tenantId, submissionId, tokenId, audience } = ids;

  return withTenant({ tenantId }, async (tx) => {
    const submission = await getSubmission(tx, submissionId);
    if (!submission) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (submission.status === "signed" || submission.status === "revoked") {
      // Un document signé est figé : on ne réécrit pas ce qui fait preuve.
      return NextResponse.json({ error: "already_signed" }, { status: 409 });
    }

    const answers = body.answers as Answers;

    // ---------------------------------------------------------------------
    // Enregistrement intermédiaire
    // ---------------------------------------------------------------------
    if (body.action === "save") {
      const { answers: cleaned } = validateAnswers(submission.definition, answers);
      await writeAnswers(tx, {
        tenantId,
        submissionId,
        definition: submission.definition,
        answers: cleaned,
        status: "in_progress",
      });
      return NextResponse.json({ ok: true, saved: Object.keys(cleaned).length });
    }

    // ---------------------------------------------------------------------
    // Signature
    // ---------------------------------------------------------------------
    const validation = validateAnswers(submission.definition, answers);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "validation_failed", errors: validation.errors },
        { status: 422 },
      );
    }

    const signatureBlock = submission.definition.signature;
    const requiredStatements = (signatureBlock?.statements ?? []).filter((s) => s.required);
    const acceptedIds = new Set(body.statements.map((s) => s.id));
    const missing = requiredStatements.filter((s) => !acceptedIds.has(s.id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "statements_missing", missing: missing.map((s) => s.id) },
        { status: 422 },
      );
    }

    const { answersHash } = await writeAnswers(tx, {
      tenantId,
      submissionId,
      definition: submission.definition,
      answers: validation.answers,
      status: "completed",
    });
    await markCompleted(tx, submissionId);

    const tenant = await getTenantSelf(tx);
    const signedAt = new Date();

    const statements = (signatureBlock?.statements ?? [])
      .filter((statement) => acceptedIds.has(statement.id))
      .map((statement) => ({
        id: statement.id,
        text: statement.text,
        acceptedAt:
          body.statements.find((s) => s.id === statement.id)?.acceptedAt ??
          signedAt.toISOString(),
      }));

    const chain = await verifyAuditChain(tx, tenantId);

    const proof = buildProofBundle({
      submissionId,
      tenantName: tenant.name,
      form: {
        templateKey: submission.templateKey,
        title: submission.definition.title,
        version: submission.formVersion,
        contentHash: submission.formContentHash,
      },
      answersHash,
      answersCount: Object.keys(validation.answers).length,
      patient: {
        displayName: submission.patient
          ? `${submission.patient.firstName} ${submission.patient.lastName}`
          : body.signerName,
        birthDate: submission.patient?.birthDate?.toISOString().slice(0, 10) ?? null,
      },
      signer: {
        role: audience,
        name: body.signerName,
        level: signatureBlock?.level ?? "simple",
      },
      statements,
      timeline: {
        sentAt: submission.sentAt,
        firstOpenedAt: submission.firstOpenedAt,
        startedAt: submission.firstOpenedAt,
        completedAt: signedAt,
        signedAt,
      },
      client: {
        ip: client.ip,
        userAgent: client.userAgent,
        locale: body.locale ?? submission.locale,
        timezoneOffsetMinutes: body.timezoneOffsetMinutes ?? null,
      },
      reading: normalizeDwell(
        body.dwell,
        submission.definition.sections.map((s) => ({ id: s.id, title: s.title })),
      ),
      otp: null,
      auditChainHead: chain.head,
    });

    const signatureImage = decodeSignatureImage(body.signatureImage);

    const { bytes, sha256 } = await renderSubmissionPdf({
      definition: submission.definition,
      answers: validation.answers,
      tenant: {
        name: tenant.name,
        legalNotice: tenant.legalNotice,
        address: formatAddress(tenant.address),
        brandColor: tenant.branding.primaryColor ?? null,
      },
      patient: {
        displayName: submission.patient
          ? `${submission.patient.firstName} ${submission.patient.lastName}`
          : body.signerName,
        birthDate: submission.patient?.birthDate
          ? submission.patient.birthDate.toLocaleDateString("fr-FR")
          : null,
      },
      signature: {
        signerName: body.signerName,
        signerRole: audience,
        signedAt,
        statements,
        imagePng: signatureImage,
      },
      proof,
    });

    const storageKey = buildStorageKey({
      tenantId,
      submissionId,
      kind: submission.templateKind,
      filename: `${submission.templateKey}.pdf`,
    });
    const stored = await documentStore(tx, tenantId).put(storageKey, bytes);

    const [document] = await tx<{ id: string }[]>`
      insert into documents (
        tenant_id, submission_id, kind, filename, storage_key, sha256, byte_size
      ) values (
        ${tenantId}, ${submissionId}, ${submission.templateKind},
        ${`${submission.templateKey}.pdf`}, ${stored.key}, ${sha256},
        ${stored.byteSize}
      )
      returning id
    `;

    await tx`
      insert into signatures (
        tenant_id, submission_id, signer_role, signer_name, level,
        document_hash, document_id, signature_image, proof, signed_at
      ) values (
        ${tenantId}, ${submissionId}, ${audience},
        ${body.signerName}, ${signatureBlock?.level ?? "simple"}, ${sha256},
        ${document?.id ?? null}, ${signatureImage},
        ${tx.json(proof as never)}, ${signedAt}
      )
    `;

    // Consentements à l'image : tracés séparément pour pouvoir être révoqués
    // usage par usage, sans toucher au reste du dossier.
    for (const section of submission.definition.sections) {
      for (const field of section.fields) {
        if (field.type !== "photo_consent") continue;
        const granted = validation.answers[field.id] === true;
        await tx`
          insert into image_rights_consents (
            tenant_id, patient_id, submission_id, scope, granted, granted_at, proof
          ) values (
            ${tenantId}, ${submission.patientId}, ${submissionId}, ${field.scope},
            ${granted}, ${granted ? signedAt : null},
            ${tx.json({ statement: field.statement, proofHash: proof.hash } as never)}
          )
          on conflict (tenant_id, patient_id, scope, submission_id) do update
            set granted = excluded.granted, granted_at = excluded.granted_at
        `;
      }
    }

    await markSigned(tx, submissionId);
    await markTokenUsed(tx, tokenId);
    await revokeTokensForSubmission(tx, submissionId);

    await recordAudit(tx, tenantId, {
      actorType: "patient",
      actorLabel: body.signerName,
      action: "submission.signed",
      objectType: "submission",
      objectId: submissionId,
      ip: client.ip,
      userAgent: client.userAgent,
      metadata: {
        documentSha256: sha256,
        proofHash: proof.hash,
        formVersion: submission.formVersion,
        statements: statements.map((s) => s.id),
      },
    });

    return NextResponse.json({ ok: true, signed: true, documentHash: sha256 });
  });
}
