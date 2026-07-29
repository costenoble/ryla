import type { FormDefinitionInput } from "../form-schema";

/**
 * Bibliothèque — chirurgie dentaire et implantologie.
 *
 * Ces modèles sont l'actif qu'un concurrent ne copie pas en une semaine. Ils
 * sont rédigés pour être opposables, pas pour être exhaustifs : chaque
 * question est là parce qu'elle change la conduite du praticien ou parce que
 * son absence se retourne contre lui.
 *
 * Rappel sur les messages de vigilance : ils décrivent une déclaration du
 * patient. Jamais une conduite à tenir.
 */

export const anamneseDentaire: FormDefinitionInput = {
  schemaVersion: 1,
  title: "Questionnaire médical préalable aux soins dentaires",
  intro:
    "Ces informations sont indispensables à votre sécurité. Elles sont couvertes " +
    "par le secret médical et ne sont accessibles qu'à votre praticien.",
  locale: "fr",
  availableLocales: ["fr", "en", "es", "ar", "pt", "tr"],
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
        {
          id: "medecin_traitant",
          type: "text",
          label: "Nom de votre médecin traitant",
        },
      ],
    },
    {
      id: "traitements",
      title: "Traitements en cours",
      fields: [
        {
          id: "traitement_en_cours",
          type: "boolean",
          label: "Prenez-vous actuellement des médicaments ?",
          required: true,
        },
        {
          id: "liste_medicaments",
          type: "textarea",
          label: "Lesquels ? (nom et dosage si vous les connaissez)",
          required: true,
          visibleIf: { field: "traitement_en_cours", op: "eq", value: true },
        },
        {
          id: "anticoagulant",
          type: "boolean",
          label:
            "Prenez-vous un anticoagulant ou un antiagrégant plaquettaire ? " +
            "(Kardégic, Plavix, Préviscan, Eliquis, Xarelto, aspirine…)",
          required: true,
          vigilance: [
            {
              level: "critical",
              when: { field: "anticoagulant", op: "eq", value: true },
              message: "Le patient déclare prendre un traitement anticoagulant ou antiagrégant.",
            },
          ],
        },
        {
          id: "anticoagulant_nom",
          type: "text",
          label: "Nom du traitement",
          visibleIf: { field: "anticoagulant", op: "eq", value: true },
        },
        {
          id: "biphosphonates",
          type: "boolean",
          label:
            "Avez-vous reçu ou recevez-vous un traitement par bisphosphonates ou " +
            "dénosumab ? (Fosamax, Actonel, Prolia, Xgeva, Zometa…)",
          required: true,
          help: "Y compris s'il a été arrêté : ces traitements ont une rémanence longue.",
          vigilance: [
            {
              level: "critical",
              when: { field: "biphosphonates", op: "eq", value: true },
              message:
                "Le patient déclare un traitement actuel ou passé par bisphosphonates / dénosumab.",
            },
          ],
        },
        {
          id: "corticoides",
          type: "boolean",
          label: "Suivez-vous un traitement prolongé par corticoïdes ?",
        },
      ],
    },
    {
      id: "allergies",
      title: "Allergies",
      fields: [
        {
          id: "a_des_allergies",
          type: "boolean",
          label: "Avez-vous des allergies connues ?",
          required: true,
        },
        {
          id: "allergies_types",
          type: "multiselect",
          label: "À quoi ?",
          required: true,
          visibleIf: { field: "a_des_allergies", op: "eq", value: true },
          options: [
            { value: "penicilline", label: "Pénicilline / antibiotiques" },
            { value: "latex", label: "Latex" },
            { value: "anesthesiques", label: "Anesthésiques locaux" },
            { value: "iode", label: "Iode / produits de contraste" },
            { value: "metaux", label: "Métaux (nickel, chrome…)" },
            { value: "aspirine", label: "Aspirine / anti-inflammatoires" },
            { value: "autre", label: "Autre" },
          ],
          vigilance: [
            {
              level: "critical",
              when: {
                field: "allergies_types",
                op: "in",
                value: ["penicilline", "anesthesiques", "latex"],
              },
              message:
                "Le patient déclare une allergie à un produit utilisé en soins dentaires.",
            },
          ],
        },
        {
          id: "allergies_details",
          type: "textarea",
          label: "Précisez (produit, type de réaction)",
          visibleIf: { field: "a_des_allergies", op: "eq", value: true },
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
            { value: "cardiaque", label: "Maladie cardiaque, valve, souffle" },
            { value: "endocardite", label: "Endocardite infectieuse" },
            { value: "hypertension", label: "Hypertension artérielle" },
            { value: "diabete", label: "Diabète" },
            { value: "asthme", label: "Asthme" },
            { value: "epilepsie", label: "Épilepsie" },
            { value: "hepatite", label: "Hépatite" },
            { value: "vih", label: "VIH" },
            { value: "cancer", label: "Cancer (traitement en cours ou passé)" },
            { value: "radiotherapie_tete_cou", label: "Radiothérapie de la tête ou du cou" },
            { value: "coagulation", label: "Trouble de la coagulation" },
            { value: "renale", label: "Insuffisance rénale" },
            { value: "immunodepression", label: "Immunodépression" },
          ],
          vigilance: [
            {
              level: "critical",
              when: {
                field: "pathologies",
                op: "in",
                value: ["endocardite", "cardiaque", "coagulation"],
              },
              message:
                "Le patient déclare un antécédent cardiaque ou un trouble de la coagulation.",
            },
            {
              level: "critical",
              when: {
                field: "pathologies",
                op: "contains",
                value: "radiotherapie_tete_cou",
              },
              message:
                "Le patient déclare un antécédent de radiothérapie de la tête ou du cou.",
            },
            {
              level: "warning",
              when: {
                field: "pathologies",
                op: "in",
                value: ["diabete", "immunodepression", "renale"],
              },
              message:
                "Le patient déclare un diabète, une immunodépression ou une insuffisance rénale.",
            },
          ],
        },
        {
          id: "diabete_equilibre",
          type: "select",
          label: "Votre diabète est-il équilibré ?",
          visibleIf: { field: "pathologies", op: "contains", value: "diabete" },
          options: [
            { value: "oui", label: "Oui, suivi régulier" },
            { value: "non", label: "Non ou déséquilibré" },
            { value: "inconnu", label: "Je ne sais pas" },
          ],
        },
        {
          id: "pacemaker",
          type: "boolean",
          label: "Portez-vous un pacemaker ou un défibrillateur implantable ?",
          required: true,
          vigilance: [
            {
              level: "critical",
              when: { field: "pacemaker", op: "eq", value: true },
              message: "Le patient déclare porter un pacemaker ou un défibrillateur implantable.",
            },
          ],
        },
        {
          id: "prothese_articulaire",
          type: "boolean",
          label: "Portez-vous une prothèse articulaire (hanche, genou…) ?",
        },
        {
          id: "grossesse",
          type: "boolean",
          label: "Êtes-vous enceinte ou allaitez-vous ?",
          visibleIf: { field: "sexe", op: "eq", value: "f" },
          vigilance: [
            {
              level: "warning",
              when: { field: "grossesse", op: "eq", value: true },
              message: "La patiente déclare être enceinte ou allaiter.",
            },
          ],
        },
        {
          id: "grossesse_semaines",
          type: "number",
          label: "À combien de semaines d'aménorrhée ?",
          unit: "SA",
          min: 0,
          max: 45,
          visibleIf: { field: "grossesse", op: "eq", value: true },
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
          id: "bruxisme",
          type: "boolean",
          label: "Serrez-vous ou grincez-vous des dents ?",
        },
      ],
    },
    {
      id: "experience_dentaire",
      title: "Vos soins dentaires",
      fields: [
        {
          id: "anesthesie_probleme",
          type: "boolean",
          label: "Avez-vous déjà mal supporté une anesthésie dentaire ?",
          required: true,
          vigilance: [
            {
              level: "warning",
              when: { field: "anesthesie_probleme", op: "eq", value: true },
              message: "Le patient déclare avoir déjà mal supporté une anesthésie dentaire.",
            },
          ],
        },
        {
          id: "anesthesie_probleme_details",
          type: "textarea",
          label: "Que s'est-il passé ?",
          visibleIf: { field: "anesthesie_probleme", op: "eq", value: true },
        },
        {
          id: "saignement_prolonge",
          type: "boolean",
          label: "Avez-vous déjà saigné longtemps après une extraction ?",
          vigilance: [
            {
              level: "warning",
              when: { field: "saignement_prolonge", op: "eq", value: true },
              message: "Le patient déclare un saignement prolongé après une extraction antérieure.",
            },
          ],
        },
        {
          id: "anxiete",
          type: "scale",
          label: "Comment évaluez-vous votre appréhension des soins dentaires ?",
          min: 0,
          max: 10,
          minLabel: "Aucune",
          maxLabel: "Très forte",
        },
        {
          id: "motif",
          type: "textarea",
          label: "Motif de votre consultation",
          required: true,
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
          "et je m'engage à signaler tout changement à mon praticien.",
        required: true,
      },
      {
        id: "information",
        text:
          "J'ai compris que ces informations conditionnent la sécurité des soins " +
          "qui me seront proposés.",
        required: true,
      },
    ],
  },
  legalNotice:
    "Données traitées par le cabinet, responsable de traitement, pour la prise en " +
    "charge médicale (art. 9.2.h RGPD). Hébergement chez un prestataire certifié HDS. " +
    "Conservation 20 ans à compter du dernier acte. Vous disposez d'un droit d'accès, " +
    "de rectification et de limitation, exerçable auprès du cabinet ou de son délégué " +
    "à la protection des données.",
  reflectionPeriodDays: 0,
};

export const consentementImplantologie: FormDefinitionInput = {
  schemaVersion: 1,
  title: "Consentement éclairé — pose d'implant(s) dentaire(s)",
  intro:
    "Ce document résume l'information qui vous a été délivrée oralement lors de la " +
    "consultation. Prenez le temps de le lire ; vous pouvez poser toutes vos questions " +
    "avant de le signer.",
  locale: "fr",
  availableLocales: ["fr", "en"],
  sections: [
    {
      id: "intervention",
      title: "L'intervention proposée",
      fields: [
        {
          id: "info_principe",
          type: "info",
          label: "Principe",
          body:
            "Un implant dentaire est une racine artificielle en titane insérée dans " +
            "l'os de la mâchoire, destinée à supporter une couronne, un bridge ou une " +
            "prothèse. L'intervention se déroule sous anesthésie locale. La " +
            "cicatrisation osseuse (ostéo-intégration) demande généralement de 2 à 6 " +
            "mois avant la pose de la prothèse définitive.",
        },
        {
          id: "nombre_implants",
          type: "number",
          label: "Nombre d'implants prévus",
          min: 1,
          max: 32,
          required: true,
        },
        {
          id: "sites",
          type: "text",
          label: "Localisation (numéros de dents)",
          required: true,
        },
        {
          id: "greffe_osseuse",
          type: "boolean",
          label: "Une greffe osseuse ou un comblement sinusien est-il prévu ?",
        },
      ],
    },
    {
      id: "alternatives",
      title: "Les alternatives",
      fields: [
        {
          id: "info_alternatives",
          type: "info",
          label: "Autres options thérapeutiques",
          body:
            "D'autres solutions existent : bridge sur dents naturelles, prothèse " +
            "amovible partielle ou complète, ou abstention thérapeutique. Chacune a ses " +
            "avantages, ses inconvénients et son coût. Elles vous ont été présentées.",
        },
        {
          id: "alternatives_presentees",
          type: "consent",
          label: "Alternatives",
          required: true,
          statement:
            "Les alternatives à l'implant, y compris l'absence de traitement, m'ont été " +
            "exposées et j'ai pu en discuter avec mon praticien.",
        },
      ],
    },
    {
      id: "risques",
      title: "Les risques et complications",
      description:
        "Aucune intervention chirurgicale n'est dénuée de risque. Ceux qui suivent " +
        "sont ceux qu'il vous appartient de connaître avant de décider.",
      fields: [
        {
          id: "info_risques_frequents",
          type: "info",
          label: "Suites habituelles",
          body:
            "Œdème, hématome, douleur et saignement modéré sont habituels dans les " +
            "jours qui suivent l'intervention et cèdent au traitement prescrit.",
        },
        {
          id: "info_risques_rares",
          type: "info",
          label: "Complications possibles",
          body:
            "• Échec de l'ostéo-intégration : l'implant ne se fixe pas et doit être " +
            "déposé (environ 2 à 5 % des cas).\n" +
            "• Infection du site opératoire, péri-implantite à distance.\n" +
            "• Lésion d'un nerf sensitif au maxillaire inférieur, pouvant entraîner une " +
            "diminution ou une perte de sensibilité de la lèvre et du menton, " +
            "exceptionnellement définitive.\n" +
            "• Communication ou infection sinusienne au maxillaire supérieur.\n" +
            "• Fracture osseuse, lésion d'une dent voisine.\n" +
            "• Résultat esthétique imparfait, notamment en cas de récession gingivale.",
        },
        {
          id: "info_facteurs",
          type: "info",
          label: "Facteurs qui augmentent le risque d'échec",
          body:
            "Le tabac, un diabète déséquilibré, une hygiène bucco-dentaire " +
            "insuffisante, le bruxisme et certains traitements osseux augmentent le " +
            "risque de complication et d'échec implantaire.",
        },
        {
          id: "risques_compris",
          type: "consent",
          label: "Risques",
          required: true,
          statement:
            "J'ai lu et compris la nature des risques et complications décrits " +
            "ci-dessus, y compris le risque d'échec de l'implant et le risque de lésion " +
            "nerveuse.",
        },
        {
          id: "questions_posees",
          type: "consent",
          label: "Questions",
          required: true,
          statement:
            "J'ai pu poser toutes les questions que je souhaitais et j'ai obtenu des " +
            "réponses que j'ai comprises.",
        },
      ],
    },
    {
      id: "engagements",
      title: "Vos engagements",
      fields: [
        {
          id: "suivi",
          type: "consent",
          label: "Suivi",
          required: true,
          statement:
            "Je m'engage à respecter les consignes post-opératoires, à assurer une " +
            "hygiène rigoureuse et à me présenter aux rendez-vous de contrôle. J'ai " +
            "compris que le suivi conditionne la pérennité de l'implant.",
        },
        {
          id: "devis_remis",
          type: "consent",
          label: "Devis",
          required: true,
          statement:
            "Un devis détaillé m'a été remis, mentionnant le coût total et mon reste à " +
            "charge estimé. J'ai compris qu'un traitement complémentaire imprévu ferait " +
            "l'objet d'un nouveau devis.",
        },
        {
          id: "questions_libres",
          type: "textarea",
          label: "Questions ou remarques que vous souhaitez consigner",
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
          "Après avoir reçu une information claire, loyale et appropriée, je donne mon " +
          "consentement à la réalisation de l'intervention décrite ci-dessus.",
        required: true,
      },
      {
        id: "retractation",
        text:
          "J'ai compris que je peux retirer mon consentement à tout moment avant " +
          "l'intervention, sans avoir à me justifier.",
        required: true,
      },
    ],
  },
  legalNotice:
    "Document établi en application de l'article L1111-2 du code de la santé publique. " +
    "Un exemplaire signé est conservé au dossier médical et un exemplaire vous est remis.",
  reflectionPeriodDays: 0,
};

export const dentaireLibrary = [
  {
    key: "anamnese-dentaire",
    kind: "questionnaire" as const,
    specialty: "dentaire" as const,
    libraryRef: "ryla/dentaire/anamnese@1",
    definition: anamneseDentaire,
  },
  {
    key: "consentement-implantologie",
    kind: "consentement" as const,
    specialty: "dentaire" as const,
    libraryRef: "ryla/dentaire/consentement-implant@1",
    definition: consentementImplantologie,
  },
];
