import type { Metadata } from "next";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listNomenclature, nomenclatureStatus } from "@/lib/repos/nomenclature";
import { listPatients } from "@/lib/repos/patients";
import { letterheadBlocks } from "@/lib/letterhead";
import { formatAddress, getTenantSelf } from "@/lib/repos/tenants";
import { QuoteEditor } from "./QuoteEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau devis" };

export default async function NouveauDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requireSession();
  const { patient } = await searchParams;

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    const tenant = await getTenantSelf(tx);
    return {
      tenant,
      patients: await listPatients(tx),
      nomenclature: await listNomenclature(tx, tenant.specialty),
      status: await nomenclatureStatus(tx),
    };
  });

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Devis"
          title="Nouveau devis"
          description="Les actes viennent du référentiel CCAM / NGAP. L'aperçu se met à jour à la saisie."
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <QuoteEditor
          initialPatientId={patient ?? null}
          patients={data.patients.map((entry) => ({
            id: entry.id,
            firstName: entry.firstName,
            lastName: entry.lastName,
            birthDate: entry.birthDate
              ? entry.birthDate.toLocaleDateString("fr-FR")
              : null,
          }))}
          context={{
            tenantName: data.tenant.name,
            specialty: data.tenant.specialty,
            letterheadMode: data.tenant.branding.letterheadMode ?? "none",
            letterheadBlocks: letterheadBlocks(data.tenant.branding),
            hasLetterheadImage: Boolean(data.tenant.branding.letterheadImageKey),
            primaryColor: data.tenant.branding.primaryColor ?? "#2563EB",
            practitionerName: session.user.fullName,
            practitionerIdentifier: session.user.rpps,
            practiceAddress: formatAddress(data.tenant.address),
            nomenclature: data.nomenclature,
            withoutTariff: data.status.withoutTariff,
          }}
        />
      </FadeUp>
    </div>
  );
}
