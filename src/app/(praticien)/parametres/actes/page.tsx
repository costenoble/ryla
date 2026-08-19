import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listNomenclature } from "@/lib/repos/nomenclature";
import { getTenantSelf } from "@/lib/repos/tenants";
import { ActsManager } from "./ActsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Référentiel d'actes" };

export default async function ActesPage() {
  const session = await requireSession();

  const entries = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const tenant = await getTenantSelf(tx);
    return listNomenclature(tx, tenant.specialty);
  });

  return (
    <div>
      <FadeUp>
        <Link
          href="/parametres"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Réglages
        </Link>

        <PageHeader
          eyebrow="Réglages"
          title="Référentiel d'actes"
          description="Les codes CCAM et NGAP proposés à la saisie d'un devis. Corrigez ce qui ne correspond pas à votre pratique : votre version prime sur la référence."
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <ActsManager entries={entries} />
      </FadeUp>
    </div>
  );
}
