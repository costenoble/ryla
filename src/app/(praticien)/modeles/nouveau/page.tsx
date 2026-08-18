import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { TemplateEditor } from "../editeur/TemplateEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau modèle" };

export default async function NouveauModelePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireSession();
  const { type } = await searchParams;
  const kind = ["questionnaire", "consentement", "droit_image"].includes(type ?? "")
    ? type!
    : "questionnaire";

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
            description="Composez vos questions. Chaque enregistrement publie une version : les documents déjà envoyés gardent la leur."
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <TemplateEditor kind={kind} />
      </FadeUp>
    </div>
  );
}
