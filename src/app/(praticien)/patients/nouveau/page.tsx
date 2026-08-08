import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { FadeUp } from "@/components/motion";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PatientForm } from "../PatientForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau patient" };

export default async function NouveauPatientPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <Link
          href="/patients"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-body"
        >
          <IconArrowLeft className="size-4" />
          Patients
        </Link>

        <div className="mt-4">
          <PageHeader
            title="Nouveau patient"
            description="Créez la fiche maintenant, ou laissez-la se créer au premier envoi de document."
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <PatientForm />
      </FadeUp>
    </div>
  );
}
