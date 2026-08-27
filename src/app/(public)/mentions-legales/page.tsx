import type { Metadata } from "next";
import { LegalPage, LegalRow, LegalSection } from "@/components/legal";
import { HOSTS, orMissing, RYLA } from "@/lib/legal-entity";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergeurs et contacts du service Ryla.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      updatedOn="21 août 2026"
      intro="Informations exigées par l'article 6-III de la loi pour la confiance dans l'économie numérique."
    >
      <LegalSection title="Éditeur du service">
        <dl className="mt-1">
          <LegalRow label="Dénomination sociale" value={orMissing(RYLA.name)} />
          <LegalRow label="Forme juridique" value={orMissing(RYLA.legalForm)} />
          {RYLA.capital ? <LegalRow label="Capital social" value={RYLA.capital} /> : null}
          <LegalRow label="SIREN" value={orMissing(RYLA.siren)} />
          <LegalRow label="RCS" value={orMissing(RYLA.rcs)} />
          {RYLA.vatNumber ? (
            <LegalRow label="TVA intracommunautaire" value={RYLA.vatNumber} />
          ) : null}
          <LegalRow label="Siège social" value={orMissing(RYLA.address)} />
          <LegalRow label="Contact" value={orMissing(RYLA.email)} />
          {RYLA.phone ? <LegalRow label="Téléphone" value={RYLA.phone} /> : null}
          <LegalRow
            label="Directeur de la publication"
            value={orMissing(RYLA.publicationDirector)}
          />
        </dl>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p>
          Les données de santé sont hébergées chez un prestataire certifié
          «&nbsp;Hébergeur de Données de Santé&nbsp;», conformément à l'article
          L1111-8 du code de la santé publique.
        </p>
        <dl className="mt-1">
          {HOSTS.map((host) => (
            <LegalRow
              key={host.role}
              label={host.role}
              value={
                host.name.trim() === ""
                  ? "à compléter"
                  : `${host.name}${host.address ? ` — ${host.address}` : ""}`
              }
            />
          ))}
        </dl>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          La structure du service, ses interfaces et la bibliothèque de modèles de
          questionnaires et de consentements sont protégées par le droit d'auteur.
          Toute reproduction ou réutilisation sans autorisation est interdite.
        </p>
        <p>
          Les documents établis par un cabinet à partir du service — devis,
          questionnaires complétés, consentements signés — demeurent la propriété de
          ce cabinet.
        </p>
      </LegalSection>

      <LegalSection title="Rôle de Ryla au regard des données de santé">
        <p>
          Ryla n'est pas responsable de traitement. Chaque cabinet utilisateur l'est
          pour les données de ses patients ; Ryla agit en qualité de sous-traitant au
          sens de l'article 28 du RGPD, sur les seules instructions du cabinet.
        </p>
        <p>
          Le service ne fournit aucune aide à la décision clinique et ne constitue pas
          un dispositif médical au sens du règlement (UE) 2017/745. Les messages de
          vigilance décrivent une déclaration du patient et ne recommandent jamais une
          conduite à tenir.
        </p>
      </LegalSection>

      <LegalSection title="Signalement">
        <p>
          Tout contenu manifestement illicite peut être signalé à l'adresse de contact
          indiquée ci-dessus. Un signalement de violation de données doit être adressé
          au{" "}
          {RYLA.dpo.trim() === ""
            ? "délégué à la protection des données du cabinet concerné"
            : RYLA.dpo}
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
