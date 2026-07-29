import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft, IconTemplate } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listTemplates } from "@/lib/repos/forms";
import { NewSubmissionForm } from "./NewSubmissionForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouvel envoi" };

export default async function NouveauDossierPage() {
  const session = await requireSession();
  const templates = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    listTemplates(tx),
  );

  const usable = templates.filter((template) => template.currentVersionId);

  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <Link
          href="/dossiers"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Dossiers
        </Link>

        <div className="mt-4">
          <PageHeader
            title="Envoyer un document"
            description="Le patient reçoit un lien vers le portail sécurisé. Aucun document, aucune donnée de santé ne transite par email."
          />
        </div>
      </FadeUp>

      {usable.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={<IconTemplate className="size-5" />}
            title="Aucun modèle publié"
            description="Il faut au moins un modèle avec une version publiée pour pouvoir envoyer un document."
            action={<ButtonLink href="/modeles" variant="outline">Voir les modèles</ButtonLink>}
          />
        </FadeUp>
      ) : (
        <FadeUp delay={0.05}>
          <NewSubmissionForm
            templates={usable.map((template) => ({
              id: template.id,
              title: template.title,
              kind: template.kind,
            }))}
          />
        </FadeUp>
      )}
    </div>
  );
}
