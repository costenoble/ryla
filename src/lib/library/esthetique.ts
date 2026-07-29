import type { FormDefinitionInput } from "../form-schema";
import { REFLECTION_DAYS_ESTHETIQUE } from "../reflection";

/**
 * Bibliothèque — médecine et chirurgie esthétique.
 *
 * Segment où le produit vaut le plus cher : devis élevés, actes hors
 * nomenclature, contentieux fréquent, et un délai de réflexion légal que
 * personne ne trace correctement.
 */

export const anamneseEsthetique: FormDefinitionInput = {
  schemaVersion: 1,
  title: "Questionnaire médical pré-opératoire",
  intro:
    "Ces informations conditionnent la sécurité de votre intervention. Elles sont " +
    "couvertes par le secret médical.",
  locale: "fr",
  availableLocales: ["fr", "en", "es", "it", "ar", "ru"],
  sections: [
    {
      id: "identite",
      title: "Vous",
      fields: [
        { id: "nom", type: "text", label: "Nom", required: true },
        { id: "prenom", type: "text", label: "Prénom", required: true },
        { id: "date_naissance", type: "date", label: "Date de naissance", required: true },
        {
          id: "sexe",
          type: "select",
          label: "Sexe",
          required: true,
          options: [
            { value: "f", label: "Féminin" },
            { value: "m", label: "Masculin" },
            { value: "autre", label: "Autre / ne souhaite pas préciser" },
          ],
        },
        { id: "taille", type: "number", label: "Taille", unit: "cm", min: 100, max: 250 },
        { id: "poids", type: "number", label: "Poids", unit: "kg", min: 30, max: 300 },
        {
          id: "poids_variation",
          type: "boolean",
          label: "Votre poids a-t-il varié de plus de 5 kg dans les 6 derniers mois ?",
          vigilance: [
            {
              level: "info",
              when: { field: "poids_variation", op: "eq", value: true },
              message: "Le patient déclare une variation pondérale récente de plus de 5 kg.",
            },
          ],
        },
      ],
    },
    {
      id: "intervention",
      title: "L'intervention envisagée",
      fields: [
        {
          id: "acte_envisage",
          type: "text",
          label: "Intervention envisagée",
          required: true,
        },
        {
          id: "attentes",
          type: "textarea",
          label: "Qu'attendez-vous de cette intervention ?",
          required: true,
          help:
            "Décrivez avec vos mots. Vos attentes seront reprises lors de la consultation.",
        },
        {
          id: "deja_opere_meme_zone",
          type: "boolean",
          label: "Avez-vous déjà été opéré(e) de cette zone ?",
          required: true,
          vigilance: [
            {
              level: "warning",
              when: { field: "deja_opere_meme_zone", op: "eq", value: true },
              message: "Le patient déclare un antécédent chirurgical sur la zone concernée.",
            },
          ],
        },
        {
          id: "deja_opere_details",
          type: "textarea",
          label: "Quelle intervention, à quelle date, par quel praticien ?",
          visibleIf: { field: "deja_opere_meme_zone", op: "eq", value: true },
        },
        {
          id: "injections_anterieures",
          type: "multiselect",
          label: "Avez-vous déjà reçu des injections esthétiques ?",
          options: [
            { value: "acide_hyaluronique", label: "Acide hyaluronique" },
            { value: "toxine", label: "Toxine botulique" },
            { value: "produit_permanent", label: "Produit permanent ou inconnu" },
            { value: "fils_tenseurs", label: "Fils tenseurs" },
          ],
          vigilance: [
            {
              level: "warning",
              when: {
                field: "injections_anterieures",
                op: "contains",
                value: "produit_permanent",
              },
              message:
                "Le patient déclare avoir reçu un produit de comblement permanent ou d'origine inconnue.",
            },
          ],
        },
      ],
    },
    {
      id: "antecedents",
      title: "Antécédents médicaux",
      fields: [
        {
          id: "pathologies",
          type: "multiselect",
          label: "Avez-vous ou avez-vous eu l'une de ces affections ?",
          options: [
            { value: "cardiaque", label: "Maladie cardiaque" },
            { value: "hypertension", label: "Hypertension artérielle" },
            { value: "thrombose", label: "Phlébite, thrombose ou embolie pulmonaire" },
            { value: "diabete", label: "Diabète" },
            { value: "coagulation", label: "Trouble de la coagulation" },
            { value: "auto_immune", label: "Maladie auto-immune" },
            { value: "cicatrisation", label: "Trouble de la cicatrisation, chéloïdes" },
            { value: "herpes", label: "Herpès récidivant" },
            { value: "cancer", label: "Cancer" },
            { value: "psychiatrique", label: "Suivi psychiatrique ou psychologique" },
          ],
          vigilance: [
            {
              level: "critical",
              when: {
                field: "pathologies",
                op: "in",
                value: ["coagulation", "thrombose"],
              },
              message:
                "Le patient déclare un trouble de la coagulation ou un antécédent thrombo-embolique.",
            },
            {
              level: "warning",
              when: {
                field: "pathologies",
                op: "in",
                value: ["cicatrisation", "auto_immune", "diabete"],
              },
              message:
                "Le patient déclare un facteur pouvant affecter la cicatrisation.",
            },
          ],
        },
        {
          id: "anesthesie_generale_anterieure",
          type: "boolean",
          label: "Avez-vous déjà subi une anesthésie générale ?",
          required: true,
        },
        {
          id: "anesthesie_incident",
          type: "boolean",
          label: "Un incident est-il survenu lors d'une anesthésie ?",
          visibleIf: { field: "anesthesie_generale_anterieure", op: "eq", value: true },
          vigilance: [
            {
              level: "critical",
              when: { field: "anesthesie_incident", op: "eq", value: true },
              message: "Le patient déclare un incident lors d'une anesthésie antérieure.",
            },
          ],
        },
        {
          id: "anesthesie_incident_details",
          type: "textarea",
          label: "Lequel ?",
          visibleIf: { field: "anesthesie_incident", op: "eq", value: true },
        },
        {
          id: "grossesse",
          type: "boolean",
          label: "Êtes-vous enceinte ou allaitez-vous ?",
          visibleIf: { field: "sexe", op: "eq", value: "f" },
          vigilance: [
            {
              level: "critical",
              when: { field: "grossesse", op: "eq", value: true },
              message: "La patiente déclare être enceinte ou allaiter.",
            },
          ],
        },
      ],
    },
    {
      id: "traitements",
      title: "Traitements et allergies",
      fields: [
        {
          id: "anticoagulant",
          type: "boolean",
          label:
            "Prenez-vous un anticoagulant, un antiagrégant ou de l'aspirine ?",
          required: true,
          vigilance: [
            {
              level: "critical",
              when: { field: "anticoagulant", op: "eq", value: true },
              message: "Le patient déclare prendre un anticoagulant ou un antiagrégant.",
            },
          ],
        },
        {
          id: "traitements_liste",
          type: "textarea",
          label: "Autres traitements en cours (médicaments, compléments, phytothérapie)",
          help:
            "Certains compléments alimentaires modifient la coagulation : pensez à les mentionner.",
        },
        {
          id: "isotretinoine",
          type: "boolean",
          label:
            "Avez-vous pris de l'isotrétinoïne (Roaccutane, Curacné…) dans les 12 derniers mois ?",
          vigilance: [
            {
              level: "warning",
              when: { field: "isotretinoine", op: "eq", value: true },
              message: "Le patient déclare une prise d'isotrétinoïne dans les 12 derniers mois.",
            },
          ],
        },
        {
          id: "a_des_allergies",
          type: "boolean",
          label: "Avez-vous des allergies connues ?",
          required: true,
        },
        {
          id: "allergies_details",
          type: "textarea",
          label: "Lesquelles ? (produit, type de réaction)",
          required: true,
          visibleIf: { field: "a_des_allergies", op: "eq", value: true },
          vigilance: [
            {
              level: "warning",
              when: { field: "a_des_allergies", op: "eq", value: true },
              message: "Le patient déclare une ou plusieurs allergies.",
            },
          ],
        },
      ],
    },
    {
      id: "habitudes",
      title: "Habitudes",
      fields: [
        {
          id: "tabac",
          type: "boolean",
          label: "Fumez-vous ?",
          required: true,
          vigilance: [
            {
              level: "warning",
              when: { field: "tabac", op: "eq", value: true },
              message: "Le patient déclare être fumeur.",
            },
          ],
        },
        {
          id: "tabac_quantite",
          type: "number",
          label: "Combien de cigarettes par jour ?",
          unit: "cig./jour",
          min: 0,
          max: 100,
          visibleIf: { field: "tabac", op: "eq", value: true },
        },
        {
          id: "alcool",
          type: "select",
          label: "Consommation d'alcool",
          options: [
            { value: "aucune", label: "Aucune" },
            { value: "occasionnelle", label: "Occasionnelle" },
            { value: "reguliere", label: "Régulière" },
            { value: "quotidienne", label: "Quotidienne" },
          ],
        },
      ],
    },
  ],
  signature: {
    required: true,
    level: "simple",
    signerRoles: ["patient"],
    statements: [
      {
        id: "sincerite",
        text:
          "Je certifie que les informations communiquées sont exactes et complètes, " +
          "et je m'engage à signaler tout changement avant l'intervention.",
        required: true,
      },
    ],
  },
  legalNotice:
    "Données traitées par le cabinet, responsable de traitement, pour la prise en " +
    "charge médicale (art. 9.2.h RGPD). Hébergement chez un prestataire certifié HDS.",
  reflectionPeriodDays: 0,
};

export const consentementChirurgieEsthetique: FormDefinitionInput = {
  schemaVersion: 1,
  title: "Consentement éclairé — intervention de chirurgie esthétique",
  intro:
    "Ce document reprend l'information délivrée lors de la consultation. La loi " +
    "impose un délai de réflexion de quinze jours entre la remise du devis et " +
    "l'intervention : ce délai vous appartient, il ne peut pas être raccourci, même " +
    "à votre demande.",
  locale: "fr",
  availableLocales: ["fr", "en"],
  sections: [
    {
      id: "intervention",
      title: "L'intervention",
      fields: [
        {
          id: "acte",
          type: "text",
          label: "Intervention envisagée",
          required: true,
        },
        {
          id: "anesthesie_type",
          type: "select",
          label: "Type d'anesthésie prévu",
          required: true,
          options: [
            { value: "locale", label: "Anesthésie locale" },
            { value: "locale_sedation", label: "Anesthésie locale avec sédation" },
            { value: "generale", label: "Anesthésie générale" },
          ],
        },
        {
          id: "info_hospitalisation",
          type: "info",
          label: "Modalités",
          body:
            "La durée d'hospitalisation, la durée d'arrêt de travail et le délai avant " +
            "reprise d'une activité sportive vous ont été précisés en consultation et " +
            "figurent sur votre fiche d'information.",
        },
      ],
    },
    {
      id: "resultat",
      title: "Le résultat attendu",
      fields: [
        {
          id: "info_obligation_moyens",
          type: "info",
          label: "Une obligation de moyens, pas de résultat",
          body:
            "Le chirurgien s'engage à mettre en œuvre tous les moyens nécessaires à la " +
            "réussite de l'intervention. Il ne peut en revanche garantir un résultat " +
            "précis : la cicatrisation et la réaction des tissus varient d'une personne " +
            "à l'autre. Le résultat définitif ne s'apprécie qu'après plusieurs mois, " +
            "parfois un an.",
        },
        {
          id: "info_retouche",
          type: "info",
          label: "Retouches",
          body:
            "Une intervention complémentaire de retouche peut s'avérer nécessaire. Ses " +
            "conditions financières vous ont été communiquées et figurent sur le devis.",
        },
        {
          id: "resultat_compris",
          type: "consent",
          label: "Résultat",
          required: true,
          statement:
            "J'ai compris qu'aucun résultat précis ne peut m'être garanti et qu'une " +
            "retouche peut être nécessaire.",
        },
      ],
    },
    {
      id: "risques",
      title: "Les risques",
      fields: [
        {
          id: "info_risques",
          type: "info",
          label: "Risques communs à toute intervention chirurgicale",
          body:
            "• Hématome, pouvant nécessiter une reprise chirurgicale.\n" +
            "• Infection du site opératoire.\n" +
            "• Retard ou anomalie de cicatrisation, cicatrice hypertrophique ou chéloïde.\n" +
            "• Troubles de la sensibilité, le plus souvent transitoires.\n" +
            "• Asymétrie, irrégularité ou imperfection du résultat.\n" +
            "• Nécrose cutanée, favorisée par le tabac.\n" +
            "• Complication thrombo-embolique (phlébite, embolie pulmonaire).\n" +
            "• Risques liés à l'anesthésie, exposés par le médecin anesthésiste lors de " +
            "la consultation pré-anesthésique obligatoire.",
        },
        {
          id: "info_tabac",
          type: "info",
          label: "Tabac",
          body:
            "Le tabac augmente significativement le risque de nécrose cutanée et de " +
            "retard de cicatrisation. Un arrêt est demandé avant et après l'intervention ; " +
            "les modalités vous ont été précisées en consultation.",
        },
        {
          id: "risques_compris",
          type: "consent",
          label: "Risques",
          required: true,
          statement:
            "J'ai lu et compris la liste des risques et complications possibles, y " +
            "compris les plus graves, et j'ai pu en discuter avec le chirurgien.",
        },
        {
          id: "consultation_anesthesie",
          type: "consent",
          label: "Anesthésie",
          required: true,
          statement:
            "J'ai compris qu'une consultation pré-anesthésique est obligatoire et doit " +
            "avoir lieu au moins 48 heures avant l'intervention.",
        },
      ],
    },
    {
      id: "conditions_financieres",
      title: "Devis et délai de réflexion",
      fields: [
        {
          id: "info_delai",
          type: "info",
          label: "Délai de réflexion de quinze jours",
          body:
            "L'article D6322-30 du code de la santé publique impose un délai minimum de " +
            "quinze jours entre la remise du devis détaillé et l'intervention. Ce délai " +
            "est d'ordre public : ni le praticien ni vous-même ne pouvez y renoncer. " +
            "Aucun acompte ne peut vous être demandé pendant cette période.",
        },
        {
          id: "devis_remis",
          type: "consent",
          label: "Devis",
          required: true,
          statement:
            "Un devis détaillé et daté m'a été remis, mentionnant le coût total de " +
            "l'intervention, les honoraires, les frais de séjour et d'anesthésie.",
        },
        {
          id: "delai_compris",
          type: "consent",
          label: "Délai",
          required: true,
          statement:
            "J'ai compris que l'intervention ne peut pas avoir lieu avant l'expiration " +
            "du délai de réflexion de quinze jours suivant la remise du devis.",
        },
        {
          id: "non_remboursement",
          type: "consent",
          label: "Prise en charge",
          required: true,
          statement:
            "J'ai compris que cette intervention, à visée esthétique, n'est prise en " +
            "charge ni par l'assurance maladie ni par ma complémentaire santé.",
        },
      ],
    },
    {
      id: "libre",
      title: "Vos questions",
      fields: [
        {
          id: "questions_libres",
          type: "textarea",
          label: "Questions ou remarques que vous souhaitez consigner au dossier",
        },
      ],
    },
  ],
  signature: {
    required: true,
    level: "simple",
    signerRoles: ["patient"],
    requireOtp: true,
    statements: [
      {
        id: "consentement",
        text:
          "Après avoir reçu une information claire, loyale et appropriée, et après " +
          "avoir disposé du temps nécessaire à la réflexion, je consens à la " +
          "réalisation de l'intervention décrite.",
        required: true,
      },
      {
        id: "retractation",
        text:
          "J'ai compris que je peux retirer mon consentement à tout moment avant " +
          "l'intervention, sans avoir à me justifier et sans pénalité.",
        required: true,
      },
    ],
  },
  legalNotice:
    "Document établi en application des articles L1111-2 et L6322-2 du code de la " +
    "santé publique. Un exemplaire signé vous est remis.",
  reflectionPeriodDays: REFLECTION_DAYS_ESTHETIQUE,
};

export const droitImage: FormDefinitionInput = {
  schemaVersion: 1,
  title: "Autorisation d'utilisation de photographies",
  intro:
    "Les photographies médicales font partie de votre dossier. Leur utilisation à " +
    "d'autres fins nécessite votre accord explicite, usage par usage. Vous pouvez " +
    "accepter certains usages et en refuser d'autres, et revenir sur votre décision " +
    "à tout moment.",
  locale: "fr",
  availableLocales: ["fr", "en"],
  sections: [
    {
      id: "usages",
      title: "Vos autorisations",
      description:
        "Chaque case est indépendante. Un refus n'a aucune conséquence sur votre " +
        "prise en charge.",
      fields: [
        {
          id: "photo_dossier",
          type: "photo_consent",
          scope: "dossier_medical",
          label: "Dossier médical",
          required: true,
          statement:
            "J'autorise la réalisation et la conservation de photographies avant et " +
            "après intervention dans mon dossier médical, à des fins de suivi.",
          help:
            "Cet usage est nécessaire au suivi médical et à la comparaison des résultats.",
        },
        {
          id: "photo_site",
          type: "photo_consent",
          scope: "site_web",
          label: "Site internet du cabinet",
          statement:
            "J'autorise la publication de ces photographies sur le site internet du " +
            "cabinet, sans mention de mon identité et avec occultation du regard.",
        },
        {
          id: "photo_reseaux",
          type: "photo_consent",
          scope: "reseaux_sociaux",
          label: "Réseaux sociaux",
          statement:
            "J'autorise la publication de ces photographies sur les comptes de réseaux " +
            "sociaux du cabinet, sans mention de mon identité et avec occultation du regard.",
          help:
            "Une publication sur un réseau social peut être copiée et rediffusée par des " +
            "tiers, y compris après retrait.",
        },
        {
          id: "photo_scientifique",
          type: "photo_consent",
          scope: "publication_scientifique",
          label: "Publication scientifique",
          statement:
            "J'autorise l'utilisation de ces photographies dans une publication " +
            "scientifique ou une communication à un congrès médical, de façon anonyme.",
        },
        {
          id: "photo_formation",
          type: "photo_consent",
          scope: "formation",
          label: "Enseignement",
          statement:
            "J'autorise l'utilisation de ces photographies à des fins d'enseignement " +
            "auprès de professionnels de santé, de façon anonyme.",
        },
      ],
    },
    {
      id: "portee",
      title: "Portée de votre autorisation",
      fields: [
        {
          id: "duree",
          type: "select",
          label: "Durée de l'autorisation",
          required: true,
          visibleIf: {
            any: [
              { field: "photo_site", op: "eq", value: true },
              { field: "photo_reseaux", op: "eq", value: true },
              { field: "photo_scientifique", op: "eq", value: true },
              { field: "photo_formation", op: "eq", value: true },
            ],
          },
          options: [
            { value: "2ans", label: "2 ans" },
            { value: "5ans", label: "5 ans" },
            { value: "illimitee", label: "Sans limitation de durée" },
          ],
        },
        {
          id: "info_revocation",
          type: "info",
          label: "Retrait de votre autorisation",
          body:
            "Vous pouvez retirer votre autorisation à tout moment, par simple demande " +
            "au cabinet. Le retrait prend effet pour l'avenir : les photographies " +
            "seront retirées des supports du cabinet, mais celles déjà rediffusées par " +
            "des tiers peuvent subsister hors de son contrôle.",
        },
      ],
    },
  ],
  signature: {
    required: true,
    level: "simple",
    signerRoles: ["patient"],
    statements: [
      {
        id: "libre_eclaire",
        text:
          "Je donne les autorisations cochées ci-dessus librement, après avoir compris " +
          "leur portée, et sans contrepartie.",
        required: true,
      },
    ],
  },
  legalNotice:
    "Traitement fondé sur votre consentement (art. 6.1.a et 9.2.a RGPD) et sur le " +
    "droit à l'image (art. 9 du code civil). Retrait possible à tout moment auprès du " +
    "cabinet ou de son délégué à la protection des données.",
  reflectionPeriodDays: 0,
};

export const esthetiqueLibrary = [
  {
    key: "anamnese-esthetique",
    kind: "questionnaire" as const,
    specialty: "esthetique" as const,
    libraryRef: "ryla/esthetique/anamnese@1",
    definition: anamneseEsthetique,
  },
  {
    key: "consentement-chirurgie-esthetique",
    kind: "consentement" as const,
    specialty: "esthetique" as const,
    libraryRef: "ryla/esthetique/consentement@1",
    definition: consentementChirurgieEsthetique,
  },
  {
    key: "droit-image",
    kind: "droit_image" as const,
    specialty: "esthetique" as const,
    libraryRef: "ryla/esthetique/droit-image@1",
    definition: droitImage,
  },
];
