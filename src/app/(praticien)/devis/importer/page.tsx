import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listPatients } from "@/lib/repos/patients";
import { getTenantSelf } from "@/lib/repos/tenants";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Importer un devis" };

export default async function ImporterDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requireSession();
  const { patient } = await searchParams;

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => ({
    tenant: await getTenantSelf(tx),
    patients: await listPatients(tx),
  }));

  return (
    <div>
      <FadeUp>
        <Link
          href="/devis"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Tous les devis
        </Link>

        <PageHeader
          eyebrow="Devis"
          title="Importer un devis"
          description="Votre logiciel métier a déjà établi le devis. Ryla le fait signer, et produit la preuve qui va avec."
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="max-w-2xl">
          <ImportForm
            specialty={data.tenant.specialty}
            initialPatientId={patient ?? null}
            patients={data.patients.map((entry) => ({
              id: entry.id,
              firstName: entry.firstName,
              lastName: entry.lastName,
              email: entry.email,
            }))}
          />
        </div>
      </FadeUp>
    </div>
  );
}
