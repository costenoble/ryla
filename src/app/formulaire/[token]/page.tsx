import Image from "next/image";
import { IconCheck, IconLock } from "@/components/icons";
import { recordAudit } from "@/lib/audit";
import { requestContext } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { resolveAccessToken } from "@/lib/magic-link";
import { getSubmission, markOpened, readAnswers } from "@/lib/repos/submissions";
import { getTenantSelf } from "@/lib/repos/tenants";
import { PortalForm } from "./PortalForm";

/**
 * Portail patient.
 *
 * Pas de compte, pas de mot de passe : un lien à usage limité et daté. Chaque
 * friction ajoutée ici coûte de la complétion, et le vrai risque n'est pas
 * l'absence de mot de passe — c'est la donnée de santé baladée par email.
 *
 * Habillage aux couleurs du cabinet, pas à celles de Ryla : le patient reste
 * chez son praticien. C'est ce qui fait qu'il fait confiance au lien qu'il
 * vient d'ouvrir.
 */

export const dynamic = "force-dynamic";

const REASONS: Record<string, { title: string; message: string }> = {
  unknown: {
    title: "Lien introuvable",
    message:
      "Ce lien n'est pas reconnu. Vérifiez que vous avez ouvert l'adresse complète " +
      "reçue par message, ou contactez le cabinet.",
  },
  expired: {
    title: "Lien expiré",
    message: "Ce lien n'est plus valable. Contactez le cabinet pour en recevoir un nouveau.",
  },
  revoked: {
    title: "Lien désactivé",
    message:
      "Ce lien a été désactivé, généralement parce que le document a déjà été signé.",
  },
  exhausted: {
    title: "Lien déjà utilisé",
    message:
      "Ce lien a déjà servi. Contactez le cabinet si vous devez y accéder à nouveau.",
  },
};

function Shell({
  children,
  brandColor,
  cabinet,
}: {
  children: React.ReactNode;
  brandColor?: string;
  cabinet?: string;
}) {
  return (
    <div
      className="min-h-dvh bg-canvas"
      style={brandColor ? ({ "--brand": brandColor } as React.CSSProperties) : undefined}
    >
      {/* Voile de couleur en tête de page : discret, il donne au portail
          l'identité du cabinet sans peindre toute l'interface. */}
      <div
        className="h-1.5 w-full"
        style={{ background: "var(--brand)" }}
        aria-hidden="true"
      />

      <main className="px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-2xl">
          {cabinet ? (
            <p
              className="mb-7 text-center text-sm font-bold tracking-tight"
              style={{ color: "var(--brand)" }}
            >
              {cabinet}
            </p>
          ) : null}

          {children}

          <footer className="mt-10 flex flex-col items-center gap-3">
            <p className="flex items-center gap-1.5 text-xs text-faint">
              <IconLock className="size-3.5" />
              Vos réponses sont chiffrées et couvertes par le secret médical.
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-faint">
              <Image src="/ryla-mark.png" alt="" width={14} height={11} />
              Propulsé par Ryla
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Notice({
  title,
  message,
  done,
}: {
  title: string;
  message: string;
  done?: boolean;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-8 text-center shadow-card sm:p-10">
      {done ? (
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-positive-soft text-positive">
          <IconCheck className="size-7" />
        </span>
      ) : null}
      <h1 className="text-xl font-bold text-body">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
        {message}
      </p>
    </section>
  );
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveAccessToken(token);

  if (!resolution.ok) {
    const reason = REASONS[resolution.reason] ?? REASONS.unknown!;
    return (
      <Shell>
        <Notice title={reason.title} message={reason.message} />
      </Shell>
    );
  }

  const { tenantId, submissionId } = resolution.token;
  const client = await requestContext();

  const data = await withTenant({ tenantId }, async (tx) => {
    const isFirstOpen = await markOpened(tx, submissionId);
    const submission = await getSubmission(tx, submissionId);
    if (!submission) return null;

    const tenant = await getTenantSelf(tx);

    if (isFirstOpen) {
      await recordAudit(tx, tenantId, {
        actorType: "patient",
        action: "submission.opened",
        objectType: "submission",
        objectId: submissionId,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    }

    const answers =
      submission.status === "signed" ? {} : await readAnswers(tx, tenantId, submissionId);

    // Devis importé du logiciel métier : c'est lui que le patient doit lire,
    // le formulaire ne porte que les déclarations.
    const [attachment] = await tx<{ filename: string }[]>`
      select d.filename
      from submissions s
      join documents d on d.id = s.source_document_id
      where s.id = ${submissionId}
    `;

    return { submission, tenant, answers, attachment: attachment ?? null };
  });

  if (!data) {
    return (
      <Shell>
        <Notice title={REASONS.unknown!.title} message={REASONS.unknown!.message} />
      </Shell>
    );
  }

  const brandColor = data.tenant.branding.primaryColor;

  if (data.submission.status === "signed") {
    return (
      <Shell brandColor={brandColor} cabinet={data.tenant.name}>
        <Notice
          done
          title="Document déjà signé"
          message={`Ce document a été signé et transmis à ${data.tenant.name}. Vous pouvez en demander une copie au cabinet.`}
        />
      </Shell>
    );
  }

  return (
    <Shell brandColor={brandColor} cabinet={data.tenant.name}>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-balance text-body sm:text-[28px]">
          {data.submission.definition.title}
        </h1>
        {data.submission.definition.intro ? (
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            {data.submission.definition.intro}
          </p>
        ) : null}
      </header>

      <PortalForm
        token={token}
        definition={data.submission.definition}
        initialAnswers={data.answers}
        tenantName={data.tenant.name}
        attachment={data.attachment}
      />
    </Shell>
  );
}
