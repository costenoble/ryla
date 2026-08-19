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

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => {
    // La session ne porte pas la spécialité affichée : elle ne sert qu'ici,
    // et l'ajouter au cookie de session pour un champ de réglages serait la
    // faire voyager à chaque requête.
    const [profile] = await tx<{ speciality_label: string | null }[]>`
      select speciality_label from users where id = ${session.user.id}
    `;
    return {
      tenant: await getTenantSelf(tx),
      specialityLabel: profile?.speciality_label ?? null,
    };
  });

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
        <SettingsForm
          tenant={data.tenant}
          practitioner={{
            fullName: session.user.fullName,
            rpps: session.user.rpps,
            specialityLabel: data.specialityLabel,
          }}
        />
      </FadeUp>
    </div>
  );
}
