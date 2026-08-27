/**
 * Contrat de sous-traitance — article 28 du RGPD.
 *
 * Le cabinet est responsable de traitement, Ryla est sous-traitant. L'article
 * 28.3 impose que cette relation soit régie par un contrat écrit énonçant huit
 * obligations précises. Ce n'est pas une politique de confidentialité, ce n'est
 * pas des conditions générales : c'est un contrat au contenu imposé.
 *
 * Le texte vit ici, versionné avec le code, pour la même raison que la
 * bibliothèque de modèles : on doit pouvoir répondre, deux ans plus tard, à
 * « quel texte exact ce cabinet a-t-il accepté ce jour-là ». La version
 * acceptée est enregistrée avec l'horodatage serveur et l'adresse IP.
 *
 * ⚠️ Ce texte doit être relu par un conseil avant la mise en production. Il
 * couvre les obligations de l'article 28.3 point par point, mais l'annexe des
 * mesures de sécurité (article 32) devra être tenue à jour au fil des
 * évolutions techniques — notamment lors de la bascule vers l'hébergement HDS.
 */

export const DPA_VERSION = "2026-08-1";

export type DpaClause = { title: string; body: string };

export const DPA_CLAUSES: DpaClause[] = [
  {
    title: "Objet et rôles",
    body:
      "Le cabinet est responsable de traitement au sens de l'article 4.7 du RGPD. Ryla " +
      "agit exclusivement en qualité de sous-traitant au sens de l'article 4.8, pour le " +
      "compte du cabinet et sur ses seules instructions documentées. Ryla ne détermine " +
      "ni les finalités ni les moyens essentiels des traitements.",
  },
  {
    title: "Nature des données et des personnes concernées",
    body:
      "Les traitements portent sur des données d'identification (nom, prénom, date de " +
      "naissance, coordonnées) et sur des données concernant la santé au sens de " +
      "l'article 9.1 — réponses aux questionnaires médicaux, consentements éclairés, " +
      "devis de soins. Les personnes concernées sont les patients du cabinet, leurs " +
      "représentants légaux et les membres de son équipe.",
  },
  {
    title: "Instructions documentées",
    body:
      "Ryla ne traite les données que sur instruction du cabinet. Si Ryla estime qu'une " +
      "instruction constitue une violation du RGPD, il en informe le cabinet sans délai. " +
      "Ryla ne transfère aucune donnée hors de l'Union européenne.",
  },
  {
    title: "Confidentialité",
    body:
      "Toute personne autorisée à traiter les données est tenue à une obligation " +
      "contractuelle de confidentialité, et les données de santé sont couvertes par le " +
      "secret professionnel. Les accès sont individuels et journalisés.",
  },
  {
    title: "Sécurité (article 32)",
    body:
      "Les réponses de santé sont chiffrées en AES-256-GCM avec une clé propre à chaque " +
      "cabinet. L'isolation entre cabinets est assurée par les politiques de sécurité au " +
      "niveau des lignes de la base de données, et non par le code applicatif. Le journal " +
      "d'accès est en ajout seul et chaîné par empreinte. Aucune donnée de santé ne " +
      "transite par courrier électronique : celui-ci ne transporte qu'un lien vers un " +
      "portail sécurisé.",
  },
  {
    title: "Sous-traitance ultérieure",
    body:
      "Ryla recourt à des sous-traitants ultérieurs pour l'hébergement et l'acheminement " +
      "des messages. Le cabinet en est informé et peut s'y opposer. Ryla impose à chacun " +
      "les mêmes obligations que celles du présent contrat et demeure responsable de leur " +
      "exécution. La liste à jour est communiquée sur demande.",
  },
  {
    title: "Assistance et droits des personnes",
    body:
      "Ryla assiste le cabinet dans la réponse aux demandes d'exercice des droits. " +
      "L'export des données d'un patient et l'effacement de son identité sont disponibles " +
      "directement depuis l'application. L'effacement ne porte pas sur les documents " +
      "signés, dont la conservation reste nécessaire à la constatation et à la défense " +
      "d'un droit en justice au sens de l'article 17.3.",
  },
  {
    title: "Violations de données",
    body:
      "Ryla notifie au cabinet toute violation de données à caractère personnel dans les " +
      "meilleurs délais après en avoir pris connaissance, et lui fournit les éléments " +
      "nécessaires à sa propre notification à la CNIL.",
  },
  {
    title: "Hébergement des données de santé",
    body:
      "Les données de santé sont hébergées chez un prestataire certifié « Hébergeur de " +
      "Données de Santé » conformément à l'article L1111-8 du code de la santé publique. " +
      "Tant que la migration vers cet hébergement n'est pas achevée, l'environnement ne " +
      "doit recevoir que des données fictives — cette restriction est portée à la " +
      "connaissance du cabinet avant toute mise en service.",
  },
  {
    title: "Sort des données en fin de contrat",
    body:
      "À la fin de la prestation, le cabinet choisit entre la restitution de l'ensemble " +
      "des données dans un format structuré et leur destruction. La destruction de la clé " +
      "de chiffrement du cabinet rend ses données de santé définitivement illisibles.",
  },
  {
    title: "Audit",
    body:
      "Ryla met à disposition du cabinet les informations nécessaires pour démontrer le " +
      "respect des obligations de l'article 28 et permet la réalisation d'audits, y " +
      "compris d'inspections, par le cabinet ou un auditeur qu'il mandate.",
  },
];

/**
 * Résumé affiché à l'inscription.
 *
 * Personne ne lit onze clauses dans un formulaire, et prétendre le contraire
 * produit un consentement de façade. On affiche donc ce qui engage réellement,
 * le texte intégral restant consultable et enregistré tel quel.
 */
export const DPA_SUMMARY = [
  "Vous restez responsable de traitement ; Ryla n'agit que sur vos instructions.",
  "Les réponses de vos patients sont chiffrées avec une clé propre à votre cabinet.",
  "Aucune donnée de santé ne circule par email — seulement un lien vers le portail.",
  "Vous pouvez exporter ou faire effacer les données d'un patient depuis l'application.",
] as const;
