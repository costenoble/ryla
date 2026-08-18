import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { formatTimestamp, shortHash } from "@/lib/format";
import { getTemplate, listTemplateVersions } from "@/lib/repos/forms";
import { TemplateActions } from "../editeur/TemplateActions";
import { TemplateEditor } from "../editeur/TemplateEditor";
import { toDraft } from "../editeur/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modèle" };

export default async function ModelePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const template = await getTemplate(tx, id);
    if (!template) return null;
    return { template, versions: await listTemplateVersions(tx, id) };
  });

  if (!data) notFound();
  const { template, versions } = data;

  return (
    <div>
      <FadeUp>
        <Link
          href="/modeles"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Modèles
        </Link>

        <div className="mt-4">
          <PageHeader
            title={template.title}
            description="Modifier publie une nouvelle version. Les documents déjà envoyés restent attachés à celle qu'ils ont affichée."
            action={<TemplateActions templateId={template.id} />}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <TemplateEditor
          templateId={template.id}
          kind={template.kind}
          currentVersion={template.currentVersion}
          initialDraft={toDraft(template.definition)}
        />
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card className="mt-5">
          <CardHeader
            title="Historique des versions"
            subtitle="Une version reste consultable tant qu'un dossier s'y rattache."
          />
          <ul className="divide-y divide-line">
            {versions.map((version) => {
              const current = version.id === template.currentVersionId;
              return (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"
                >
                  <span className="tabular w-20 font-semibold text-body">
                    Version {version.version}
                  </span>
                  {current ? <Badge tone="brand">Actuelle</Badge> : null}
                  <span className="tabular text-muted">
                    {formatTimestamp(version.publishedAt)}
                  </span>
                  {version.authorName ? (
                    <span className="text-muted">{version.authorName}</span>
                  ) : null}
                  <span className="ml-auto font-mono text-[11px] tracking-tight text-faint">
                    {shortHash(version.contentHash)}
                  </span>
                  <span className="tabular w-32 text-right text-xs text-faint">
                    {version.submissionCount} dossier
                    {version.submissionCount > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </FadeUp>
    </div>
  );
}
