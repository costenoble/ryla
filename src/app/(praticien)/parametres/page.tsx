import type { Metadata } from "next";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { getTenantSelf } from "@/lib/repos/tenants";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Réglages" };

export default async function ParametresPage() {
  const session = await requireSession();
  const tenant = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    getTenantSelf(tx),
  );

  return (
    <div>
      <FadeUp>
        <PageHeader
          eyebrow="Cabinet"
          title="Réglages"
          description="Identité, en-tête des documents et mentions légales du cabinet."
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <SettingsForm tenant={tenant} />
      </FadeUp>
    </div>
  );
}
