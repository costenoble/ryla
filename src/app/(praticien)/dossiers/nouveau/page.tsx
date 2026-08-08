import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft, IconTemplate } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listTemplates } from "@/lib/repos/forms";
import { getPatient } from "@/lib/repos/patients";
import { NewSubmissionForm } from "./NewSubmissionForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouvel envoi" };

export default async function NouveauDossierPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requireSession();
  const { patient: patientId } = await searchParams;

  const data = await withTenant({ tenantId: session.tenant.id }, async (tx) => ({
    templates: await listTemplates(tx),
    // Envoi depuis une fiche patient : on pré-remplit plutôt que de faire
    // ressaisir un nom déjà connu, avec le risque de doublon que ça implique.
    patient: patientId ? await getPatient(tx, patientId) : null,
  }));

  const usable = data.templates.filter((template) => template.currentVersionId);
  const patient = data.patient;

  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <Link
          href={patient ? `/patients/${patient.id}` : "/patients"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          {patient ? `${patient.firstName} ${patient.lastName}` : "Patients"}
        </Link>

        <div className="mt-4">
          <PageHeader
            title="Envoyer un document"
            description="Le patient reçoit un lien vers le portail sécurisé. Aucun document, aucune donnée de santé ne transite par email."
          />
        </div>
      </FadeUp>

      {usable.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={<IconTemplate className="size-5" />}
            title="Aucun modèle publié"
            description="Il faut au moins un modèle avec une version publiée pour pouvoir envoyer un document."
            action={<ButtonLink href="/modeles" variant="outline">Voir les modèles</ButtonLink>}
          />
        </FadeUp>
      ) : (
        <FadeUp delay={0.05}>
          <NewSubmissionForm
            templates={usable.map((template) => ({
              id: template.id,
              title: template.title,
              kind: template.kind,
            }))}
            patient={
              patient
                ? {
                    firstName: patient.firstName,
                    lastName: patient.lastName,
                    birthDate: patient.birthDate?.toISOString().slice(0, 10) ?? "",
                    email: patient.email ?? "",
                  }
                : undefined
            }
          />
        </FadeUp>
      )}
    </div>
  );
}
