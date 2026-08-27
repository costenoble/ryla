import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal";
import { orMissing, RYLA } from "@/lib/legal-entity";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Conditions d'accès et d'usage du service Ryla par les cabinets.",
};

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d'utilisation"
      updatedOn="21 août 2026"
      intro="Ces conditions régissent l'accès au service par les cabinets et leurs équipes. Elles se complètent du contrat de sous-traitance, qui traite spécifiquement des données de santé."
    >
      <LegalSection title="Objet du service">
        <p>
          Ryla permet à un cabinet d'adresser à ses patients des questionnaires
          médicaux, des consentements éclairés et des devis, de les faire signer
          électroniquement, et de conserver le faisceau d'éléments permettant de
          démontrer l'information délivrée au sens de l'article L1111-2 du code de la
          santé publique.
        </p>
      </LegalSection>

      <LegalSection title="Ce que le service n'est pas">
        <p>
          Ryla ne fournit aucune aide à la décision clinique et n'est pas un
          dispositif médical au sens du règlement (UE) 2017/745. Les messages de
          vigilance décrivent une déclaration du patient et ne recommandent jamais une
          conduite à tenir. L'appréciation médicale relève du seul praticien.
        </p>
        <p>
          Le service ne se substitue ni au dossier médical du cabinet, ni à son
          logiciel métier, ni à son obligation de conservation.
        </p>
      </LegalSection>

      <LegalSection title="Niveau de signature électronique">
        <p>
          Les signatures recueillies sont de niveau <em>simple</em> au sens du
          règlement eIDAS. Leur valeur probante repose sur le faisceau d'éléments
          horodatés qui les accompagne — texte exact affiché, temps de lecture,
          déclarations cochées une par une, chaîne d'audit — et non sur le seul
          paraphe. Le passage à un niveau avancé via un prestataire de confiance peut
          être souscrit séparément pour les actes à fort enjeu.
        </p>
      </LegalSection>

      <LegalSection title="Obligations du cabinet">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            Vérifier que les modèles qu'il utilise correspondent à sa pratique et à
            l'information qu'il délivre effectivement. La bibliothèque fournie est un
            point de départ, pas un avis juridique.
          </li>
          <li>
            Contrôler les codes et tarifs portés sur ses devis. Le référentiel d'actes
            fourni est indicatif ; c'est le cabinet qui répond de ce qu'il facture.
          </li>
          <li>
            Renseigner ses propres mentions légales et son contact de délégué à la
            protection des données, dont il est responsable.
          </li>
          <li>
            Protéger ses identifiants et attribuer à chaque membre de l'équipe le rôle
            correspondant à ses fonctions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Disponibilité et évolutions">
        <p>
          Le service est fourni sans garantie de disponibilité ininterrompue. Les
          interventions de maintenance programmées sont annoncées à l'avance lorsque
          c'est possible. Les évolutions ne suppriment pas l'accès aux documents déjà
          signés, qui restent attachés à la version du texte qu'ils ont affichée.
        </p>
      </LegalSection>

      <LegalSection title="Résiliation et récupération des données">
        <p>
          Le cabinet peut cesser d'utiliser le service à tout moment. À la fin de la
          prestation, il choisit entre la restitution de l'ensemble de ses données
          dans un format structuré et leur destruction, dans les conditions prévues au{" "}
          <Link
            href="/sous-traitance"
            className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            contrat de sous-traitance
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Droit applicable">
        <p>
          Le droit français s'applique. À défaut de résolution amiable, le litige
          relève des juridictions compétentes du ressort du siège de l'éditeur. Pour
          toute question :{" "}
          <span className="font-medium text-body">{orMissing(RYLA.email)}</span>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
