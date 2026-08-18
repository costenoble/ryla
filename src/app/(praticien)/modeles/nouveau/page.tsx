import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { library } from "@/lib/library";
import { listTemplates } from "@/lib/repos/forms";
import { NewTemplate, type LibraryChoice } from "./NewTemplate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau modèle" };

export default async function NouveauModelePage() {
  const session = await requireSession();

  const installed = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    listTemplates(tx),
  );
  const installedRefs = new Set(
    installed.map((template) => template.libraryRef).filter(Boolean) as string[],
  );

  const choices: LibraryChoice[] = library.map((entry) => ({
    libraryRef: entry.libraryRef,
    title: entry.definition.title,
    kind: entry.kind,
    specialty: entry.specialty,
    description: entry.definition.intro ?? null,
    questionCount: entry.definition.sections.reduce(
      (sum, section) =>
        sum + section.fields.filter((field) => field.type !== "info").length,
      0,
    ),
    installed: installedRefs.has(entry.libraryRef),
  }));

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
            title="Nouveau modèle"
            description="Partez de votre questionnaire existant, d'un texte rédigé par Ryla, ou d'une page blanche."
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <NewTemplate choices={choices} />
      </FadeUp>
    </div>
  );
}
