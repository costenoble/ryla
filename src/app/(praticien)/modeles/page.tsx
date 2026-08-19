import type { Metadata } from "next";
import Link from "next/link";
import { IconAlert, IconSparkle, IconTemplate } from "@/components/icons";
import { FadeUp, HoverLift, Stagger, StaggerItem } from "@/components/motion";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getTemplate, listTemplates } from "@/lib/repos/forms";
import { checkDescriptivePhrasing, type PhrasingWarning } from "@/lib/vigilance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modèles" };

const KINDS: Record<string, { label: string; tone: BadgeTone }> = {
  questionnaire: { label: "Questionnaire", tone: "brand" },
  consentement: { label: "Consentement", tone: "ink" },
  devis: { label: "Devis", tone: "flame" },
  droit_image: { label: "Droit à l'image", tone: "flame" },
};

export default async function ModelesPage() {
  const session = await requireCapability("templates.write");

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const templates = await listTemplates(tx);

    // Contrôle rédactionnel des messages de vigilance : on veut voir passer
    // toute formulation qui glisse vers la recommandation clinique.
    const warnings: (PhrasingWarning & { templateTitle: string })[] = [];
    for (const template of templates) {
      const full = await getTemplate(tx, template.id);
      if (!full) continue;
      for (const warning of checkDescriptivePhrasing(full.definition)) {
        warnings.push({ ...warning, templateTitle: full.title });
      }
    }

    return { templates, warnings };
  });

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Bibliothèque"
          title="Modèles"
          description="Chaque publication crée une version. Les dossiers déjà envoyés restent rattachés à la version qu'ils ont affichée."
          action={
            <ButtonLink href="/modeles/nouveau">Nouveau modèle</ButtonLink>
          }
        />
      </FadeUp>

      {data.warnings.length > 0 ? (
        <FadeUp delay={0.05}>
          <Card className="mb-5 border-flame-200 bg-flame-50">
            <div className="flex items-center gap-3 px-5 pt-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-flame-600 text-white">
                <IconAlert className="size-5" />
              </span>
              <h2 className="text-sm font-bold text-flame-700">
                {data.warnings.length} message{data.warnings.length > 1 ? "s" : ""} de
                vigilance à reformuler
              </h2>
            </div>
            <ul className="space-y-3 px-5 py-4">
              {data.warnings.map((warning, index) => (
                <li key={index}>
                  <p className="text-sm text-flame-700">
                    <span className="font-semibold">{warning.templateTitle}</span> — «{" "}
                    {warning.message} »
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-flame-700/80">
                    {warning.reason}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </FadeUp>
      ) : null}

      {data.templates.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={<IconTemplate className="size-5" />}
            title="Aucun modèle"
            description="Composez votre premier formulaire, ou partez d'un modèle de la bibliothèque Ryla."
            action={<ButtonLink href="/modeles/nouveau">Nouveau modèle</ButtonLink>}
          />
        </FadeUp>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {data.templates.map((template) => {
            const kind = KINDS[template.kind];
            return (
              <StaggerItem key={template.id}>
                <HoverLift>
                  <Link
                    href={`/modeles/${template.id}`}
                    className="block h-full rounded-2xl focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:outline-none"
                  >
                    <Card className="flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-semibold text-body">{template.title}</h2>
                        <Badge tone={kind?.tone ?? "neutral"}>
                          {kind?.label ?? template.kind}
                        </Badge>
                      </div>

                      {template.description ? (
                        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-muted">
                          {template.description}
                        </p>
                      ) : null}

                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-faint">
                        <span className="tabular">
                          Version {template.currentVersion ?? "—"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular">
                          Modifié le {formatDate(template.updatedAt)}
                        </span>
                        {template.libraryRef ? (
                          <span
                            className="ml-auto inline-flex items-center gap-1 text-brand-600"
                            title={template.libraryRef}
                          >
                            <IconSparkle className="size-3.5" />
                            Bibliothèque Ryla
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                </HoverLift>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
