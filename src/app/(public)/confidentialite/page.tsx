import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal";
import { orMissing, RYLA } from "@/lib/legal-entity";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Ryla traite les données de santé : chiffrement par cabinet, cloisonnement, journal d'accès.",
};

/**
 * Politique de confidentialité.
 *
 * Elle décrit deux traitements qu'il ne faut surtout pas confondre : ceux dont
 * Ryla est responsable — les comptes praticiens, la facturation — et ceux dont
 * il n'est que sous-traitant, les données des patients. Un patient qui cherche
 * à exercer ses droits doit s'adresser à son cabinet, pas à nous ; le lui dire
 * clairement lui évite un aller-retour inutile.
 */
export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updatedOn="21 août 2026"
      intro="Ce document décrit les traitements de données à caractère personnel mis en œuvre par Ryla, et distingue ceux dont Ryla est responsable de ceux qu'il opère pour le compte d'un cabinet."
    >
      <LegalSection title="Deux rôles à ne pas confondre">
        <p>
          <strong className="text-body">Pour les données des patients</strong>, Ryla
          est <em>sous-traitant</em> au sens de l'article 28 du RGPD. Le responsable
          de traitement est le cabinet qui les a saisies. Un patient qui souhaite
          accéder à ses données, les rectifier ou en demander l'effacement s'adresse
          donc à son cabinet, qui dispose des outils nécessaires directement dans
          l'application.
        </p>
        <p>
          <strong className="text-body">Pour les comptes des praticiens</strong> —
          identité professionnelle, adresse email, journaux de connexion — Ryla est{" "}
          <em>responsable de traitement</em>. C'est de ces traitements que traite la
          suite de ce document.
        </p>
      </LegalSection>

      <LegalSection title="Données traitées et finalités">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-body">Compte et authentification</strong> — nom,
            adresse email, empreinte du mot de passe, identifiant RPPS ou ADELI. Base
            légale : exécution du contrat.
          </li>
          <li>
            <strong className="text-body">Journal de connexion et d'accès</strong> —
            horodatage, adresse IP, navigateur. Base légale : obligation légale de
            traçabilité des accès aux données de santé, et intérêt légitime à la
            sécurité du service.
          </li>
          <li>
            <strong className="text-body">Échanges avec le support</strong> — contenu
            des messages. Base légale : intérêt légitime.
          </li>
        </ul>
        <p>
          Ryla ne pratique aucun profilage, ne revend aucune donnée et n'utilise pas
          de traceur publicitaire. Le service ne dépose que le cookie strictement
          nécessaire au maintien de la session, exempté de consentement.
        </p>
      </LegalSection>

      <LegalSection title="Mesures de sécurité">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            Les réponses de santé sont chiffrées en AES-256-GCM avec une clé propre à
            chaque cabinet. Une copie de la base seule ne permet d'en lire aucune.
          </li>
          <li>
            Le cloisonnement entre cabinets est appliqué par la base de données
            elle-même, au moyen de politiques de sécurité au niveau des lignes, et non
            par le code applicatif.
          </li>
          <li>
            Chaque consultation d'un dossier est journalisée. Le journal est en ajout
            seul et chaîné par empreinte : une modification a posteriori est
            détectable.
          </li>
          <li>
            Aucune donnée de santé ne circule par courrier électronique. Les messages
            envoyés aux patients ne contiennent qu'un lien vers un portail sécurisé, et
            leur objet ne révèle ni le motif ni le type de document.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Hébergement et localisation">
        <p>
          Les données sont hébergées dans l'Union européenne. Les données de santé le
          sont chez un prestataire certifié «&nbsp;Hébergeur de Données de
          Santé&nbsp;» au sens de l'article L1111-8 du code de la santé publique.
          Aucun transfert hors de l'Union européenne n'est réalisé.
        </p>
      </LegalSection>

      <LegalSection title="Durées de conservation">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-body">Compte praticien</strong> — pendant la durée
            du contrat, puis trois mois.
          </li>
          <li>
            <strong className="text-body">Journal d'accès</strong> — six ans, durée
            usuellement retenue pour la traçabilité des accès aux données de santé.
          </li>
          <li>
            <strong className="text-body">Échecs de connexion</strong> — quinze
            minutes pour le compteur anti-force brute ; l'entrée au journal d'audit
            suit la durée ci-dessus.
          </li>
          <li>
            <strong className="text-body">Dossiers patients</strong> — la durée est
            fixée par le cabinet, responsable de traitement, au regard de ses
            obligations de conservation.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Exercice de vos droits">
        <p>
          Vous disposez des droits d'accès, de rectification, d'effacement, de
          limitation, d'opposition et de portabilité. Pour les données de votre compte
          praticien, écrivez à{" "}
          <span className="font-medium text-body">{orMissing(RYLA.email)}</span>.
        </p>
        <p>
          Si vous êtes patient, adressez votre demande au cabinet qui vous suit : c'est
          lui le responsable de traitement. Il peut exporter l'intégralité de vos
          données depuis son espace.
        </p>
        <p>
          Vous pouvez introduire une réclamation auprès de la CNIL, 3 place de
          Fontenoy, 75007 Paris.
        </p>
      </LegalSection>

      <LegalSection title="Sous-traitants ultérieurs">
        <p>
          Ryla recourt à des prestataires pour l'hébergement et l'acheminement des
          messages. Chacun est lié par les mêmes obligations, et la liste à jour est
          communiquée sur demande. Le détail des engagements figure dans le{" "}
          <Link
            href="/sous-traitance"
            className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            contrat de sous-traitance
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
