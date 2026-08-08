import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { getPatient } from "@/lib/repos/patients";
import { PatientForm } from "../../PatientForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modifier le patient" };

export default async function ModifierPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const patient = await withTenant({ tenantId: session.tenant.id }, (tx) =>
    getPatient(tx, id),
  );

  if (!patient) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <Link
          href={`/patients/${patient.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          {patient.firstName} {patient.lastName}
        </Link>

        <div className="mt-4">
          <PageHeader title="Modifier la fiche" />
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <PatientForm
          values={{
            id: patient.id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            // L'input date attend une valeur ISO courte, pas un objet Date.
            birthDate: patient.birthDate?.toISOString().slice(0, 10),
            email: patient.email ?? undefined,
            phone: patient.phone ?? undefined,
            notes: patient.notes ?? undefined,
            needsLegalRepresentative: patient.needsLegalRepresentative,
            legalRepresentative: patient.legalRepresentative,
          }}
        />
      </FadeUp>
    </div>
  );
}
