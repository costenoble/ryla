import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal";
import { DPA_CLAUSES, DPA_VERSION } from "@/lib/dpa";

export const metadata: Metadata = {
  title: "Contrat de sous-traitance",
  description:
    "Contrat régissant la relation responsable de traitement / sous-traitant, au sens de l'article 28 du RGPD.",
};

/**
 * Texte intégral du contrat de sous-traitance.
 *
 * Publié en clair et versionné : c'est la version affichée ici qui est
 * enregistrée à l'inscription, avec son horodatage. On doit pouvoir répondre
 * deux ans plus tard à « quel texte exact ce cabinet a-t-il accepté ce
 * jour-là » — la même exigence que celle qu'on applique aux patients.
 */
export default function SousTraitancePage() {
  return (
    <LegalPage
      title="Contrat de sous-traitance"
      updatedOn="21 août 2026"
      intro="Ce contrat régit la relation entre le cabinet, responsable de traitement, et Ryla, sous-traitant. Il est requis par l'article 28.3 du RGPD et son acceptation conditionne l'ouverture d'un espace."
    >
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-semibold text-body">Version {DPA_VERSION}.</span> La
          version acceptée par un cabinet est enregistrée avec son horodatage et
          l'adresse IP correspondante, et reste consultable dans ses réglages. Une
          évolution du texte ne modifie pas rétroactivement ce qui a été accepté.
        </p>
      </div>

      {DPA_CLAUSES.map((clause, index) => (
        <LegalSection key={clause.title} title={`${index + 1}. ${clause.title}`}>
          <p>{clause.body}</p>
        </LegalSection>
      ))}

      <LegalSection title="Durée">
        <p>
          Le présent contrat produit ses effets pendant toute la durée de la
          fourniture du service, et cesse avec elle — sous réserve des obligations de
          confidentialité et de restitution ou destruction des données, qui lui
          survivent.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
