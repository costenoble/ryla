/**
 * Jeu de départ du référentiel d'actes.
 *
 * ⚠️  Ce fichier contient des **codes et des libellés**, pas des tarifs.
 *
 * C'est délibéré. Un devis est un document opposable : le patient le signe, la
 * complémentaire s'en sert pour instruire, et un litige s'y réfère des années
 * plus tard. Un tarif approximatif y ferait plus de dégâts qu'un champ vide —
 * un champ vide se remplit, un chiffre faux se recopie.
 *
 * Les bases de remboursement et les honoraires limites de facturation changent
 * par avenant conventionnel. Ils viennent donc d'une seule source :
 *
 *     npm run nomenclature:import -- --file=<export officiel .csv>
 *
 * Tant que l'import n'a pas eu lieu, ces lignes portent `needsReview` et
 * l'interface de devis le signale au praticien au lieu de laisser croire
 * qu'un tarif fait foi.
 *
 * Ce que ce jeu apporte quand même, et ce n'est pas rien : le praticien ne
 * retape pas « Pose d'une couronne dentaire dentoportée céramométallique » ni
 * ne cherche le code exact — deux erreurs qui font rejeter un devis CERFA.
 */

export type NomenclatureSystem = "CCAM" | "NGAP" | "HORS_NOMENCLATURE";

export type NomenclatureSeed = {
  system: NomenclatureSystem;
  code: string;
  label: string;
  shortLabel?: string;
  specialty: "dentaire" | "esthetique" | "commun";
  category: string;
  /** false pour les actes hors nomenclature — la TVA à 20 % s'y applique. */
  reimbursable: boolean;
  reimbursementRate?: number;
  ngapKey?: string;
  /** Coefficient NGAP. Le montant vaut coefficient × valeur de la lettre-clé. */
  ngapCoefficient?: number;
  notes?: string;
  /**
   * Base de remboursement, en centimes, quand elle nous a été communiquée par
   * le cabinet. Reste marquée `needsReview` : elle vient d'un praticien, pas
   * de la base conventionnelle, et un avenant peut l'avoir changée.
   */
  baseReimbursementCents?: number;
};

const SOURCE =
  "Ryla — CCAM : codes et libellés à confronter à la base officielle ; " +
  "NGAP : relevé sur la version en vigueur du 21/06/2026 (ameli.fr)";

// ---------------------------------------------------------------------------
// Dentaire — prothèse
// ---------------------------------------------------------------------------

const protheseDentaire: NomenclatureSeed[] = [
  {
    system: "CCAM",
    code: "HBLD036",
    label: "Pose d'une couronne dentaire dentoportée céramométallique",
    shortLabel: "Couronne céramo-métallique",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
    baseReimbursementCents: 120_00,
    notes:
      "Panier selon la dent : 100 % santé sur incisives, canines et prémolaires ; " +
      "tarifs maîtrisés au-delà. Honoraire limite de facturation à vérifier dans la convention.",
  },
  {
    system: "CCAM",
    code: "HBLD403",
    label: "Pose d'une couronne dentaire dentoportée céramique monolithique (tout-céramique)",
    shortLabel: "Couronne tout-céramique / zircone",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
    baseReimbursementCents: 120_00,
    notes:
      "Plafond de facturation applicable en panier 100 % santé selon la dent et le matériau.",
  },
  {
    system: "CCAM",
    code: "HBLD038",
    label: "Pose d'une couronne dentaire dentoportée métallique",
    shortLabel: "Couronne métallique",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
    baseReimbursementCents: 120_00,
  },
  {
    system: "CCAM",
    code: "HBLD634",
    label: "Pose d'une couronne dentaire transitoire",
    shortLabel: "Couronne provisoire",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD090",
    label: "Pose d'un inlay-core (ancrage radiculaire coulé)",
    shortLabel: "Inlay-core",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD745",
    label: "Pose d'un bridge de trois éléments dentoporté",
    shortLabel: "Bridge 3 éléments",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD017",
    label: "Pose d'une prothèse amovible complète unimaxillaire",
    shortLabel: "Prothèse amovible complète",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD002",
    label: "Pose d'une prothèse amovible partielle à châssis métallique",
    shortLabel: "Stellite (partielle)",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
];

// ---------------------------------------------------------------------------
// Dentaire — soins conservateurs, chirurgie, implantologie
// ---------------------------------------------------------------------------

const soinsDentaires: NomenclatureSeed[] = [
  {
    system: "CCAM",
    code: "HBQK002",
    label: "Radiographie panoramique dentaire",
    shortLabel: "Panoramique",
    specialty: "dentaire",
    category: "imagerie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBQK061",
    label: "Radiographie intrabuccale rétroalvéolaire",
    shortLabel: "Rétroalvéolaire",
    specialty: "dentaire",
    category: "imagerie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBJD001",
    label: "Détartrage des deux arcades dentaires",
    shortLabel: "Détartrage",
    specialty: "dentaire",
    category: "conservateur",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBMD053",
    label: "Restauration d'une dent sur une face par matériau inséré en phase plastique",
    shortLabel: "Composite 1 face",
    specialty: "dentaire",
    category: "conservateur",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBMD038",
    label: "Restauration d'une dent sur deux faces par matériau inséré en phase plastique",
    shortLabel: "Composite 2 faces",
    specialty: "dentaire",
    category: "conservateur",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBFD001",
    label: "Exérèse de la pulpe camérale d'une dent (pulpotomie)",
    shortLabel: "Pulpotomie",
    specialty: "dentaire",
    category: "endodontie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBFD017",
    label: "Traitement endodontique d'une incisive ou d'une canine",
    shortLabel: "Endodontie monoradiculée",
    specialty: "dentaire",
    category: "endodontie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBFD019",
    label: "Traitement endodontique d'une molaire",
    shortLabel: "Endodontie molaire",
    specialty: "dentaire",
    category: "endodontie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBGD036",
    label: "Avulsion d'une dent permanente sur arcade",
    shortLabel: "Extraction simple",
    specialty: "dentaire",
    category: "chirurgie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBGD017",
    label: "Avulsion d'une dent de sagesse incluse ou enclavée",
    shortLabel: "Extraction dent de sagesse",
    specialty: "dentaire",
    category: "chirurgie",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD001",
    label: "Pose d'un implant intraosseux intrabuccal",
    shortLabel: "Implant",
    specialty: "dentaire",
    category: "implantologie",
    reimbursable: false,
    notes:
      "Implant non pris en charge par l'assurance maladie : honoraires libres, à faire figurer distinctement du pilier et de la couronne.",
  },
  {
    system: "CCAM",
    code: "HBLD724",
    label: "Pose d'une couronne dentaire implantoportée",
    shortLabel: "Couronne sur implant",
    specialty: "dentaire",
    category: "implantologie",
    reimbursable: false,
  },
  {
    system: "CCAM",
    code: "LBGA002",
    label: "Greffe osseuse de comblement de sinus maxillaire",
    shortLabel: "Sinus lift",
    specialty: "dentaire",
    category: "implantologie",
    reimbursable: false,
  },
];

// ---------------------------------------------------------------------------
// Dentaire — NGAP encore en vigueur
// ---------------------------------------------------------------------------

/**
 * Orthopédie dento-faciale — NGAP, article 5 de la deuxième partie.
 *
 * Relevé sur la version en vigueur du 21/06/2026 publiée par l'Assurance
 * Maladie. Ce sont les seuls actes dentaires encore à la NGAP : les soins
 * conservateurs et prothétiques en sont sortis en 2013 (décision UNCAM du
 * 15/10/13, chapitre « Dents, gencives » abrogé) et relèvent désormais de la
 * CCAM. Les lettres-clés SC et SPR qu'on voit encore circuler n'existent plus.
 *
 * Le coefficient est réel et fait foi ; la valeur en euros de la lettre-clé,
 * elle, est fixée par la convention et non par la NGAP — d'où l'absence de
 * base de remboursement ici. Le montant se calcule coefficient × valeur de la
 * lettre-clé.
 *
 * Règle transversale : la prise en charge est limitée aux traitements commencés
 * avant le seizième anniversaire.
 */
const ngapDentaire: NomenclatureSeed[] = [
  {
    system: "NGAP",
    code: "TO-15",
    label:
      "Examens avec prise d'empreinte, diagnostic et durée probable du traitement d'ODF",
    shortLabel: "ODF — bilan initial (TO 15)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 15,
    notes:
      "Les examens spéciaux concourant au diagnostic (radiographie dentaire, téléradiographie de la tête) sont remboursés en sus.",
  },
  {
    system: "NGAP",
    code: "TO-5-CEPH",
    label: "Analyse céphalométrique, en supplément du bilan d'ODF",
    shortLabel: "ODF — analyse céphalométrique (TO 5)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 5,
  },
  {
    system: "NGAP",
    code: "TO-90",
    label: "Traitement des dysmorphoses par période de six mois",
    shortLabel: "ODF — semestre de traitement (TO 90)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 90,
    notes:
      "Accord préalable obligatoire, valable un an et à renouveler. Plafond global de 540. En denture lactéale ou mixte, phase limitée à trois semestres.",
  },
  {
    system: "NGAP",
    code: "TO-5-SURV",
    label: "Séance de surveillance en cas d'interruption provisoire du traitement",
    shortLabel: "ODF — séance de surveillance (TO 5)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 5,
    notes: "Accord préalable. Deux séances par semestre au maximum.",
  },
  {
    system: "NGAP",
    code: "TO-75",
    label: "Contention après traitement orthodontique — première année",
    shortLabel: "ODF — contention 1re année (TO 75)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 75,
    notes:
      "Accord préalable, accordé seulement si le traitement a donné des résultats positifs.",
  },
  {
    system: "NGAP",
    code: "TO-50",
    label: "Contention après traitement orthodontique — deuxième année",
    shortLabel: "ODF — contention 2e année (TO 50)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 50,
    notes: "Accord préalable.",
  },
  {
    system: "NGAP",
    code: "TO-180",
    label:
      "Disjonction intermaxillaire rapide pour dysmorphose maxillaire, insuffisance respiratoire confirmée",
    shortLabel: "ODF — disjonction intermaxillaire (TO 180)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 180,
    notes: "Accord préalable.",
  },
  {
    system: "NGAP",
    code: "TO-200",
    label:
      "ODF des malformations consécutives au bec-de-lièvre total ou à la division palatine — forfait annuel",
    shortLabel: "ODF — fente labio-palatine, forfait annuel (TO 200)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 200,
    notes:
      "Accord préalable. Facturé à la fin de l'année de soins. Variante semestrielle au coefficient 100.",
  },
  {
    system: "NGAP",
    code: "TO-60",
    label: "ODF des fentes labio-palatines — facturation en période d'attente",
    shortLabel: "ODF — période d'attente (TO 60)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 60,
    notes: "Accord préalable.",
  },
  {
    system: "NGAP",
    code: "TO-90-CHIR",
    label:
      "ODF au-delà du seizième anniversaire, préalable à une intervention chirurgicale sur les maxillaires",
    shortLabel: "ODF — préparation chirurgicale (TO 90)",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    ngapCoefficient: 90,
    notes:
      "Accord préalable, pour une période de six mois non renouvelable. La demande doit être accompagnée d'une lettre du chirurgien motivant le traitement.",
  },
  {
    system: "NGAP",
    code: "CXD",
    label: "Consultation bucco-dentaire complexe",
    shortLabel: "CXD — consultation complexe",
    specialty: "dentaire",
    category: "consultation",
    reimbursable: true,
    ngapKey: "CXD",
  },
];

// ---------------------------------------------------------------------------
// Esthétique et dermatologie
//
// La chirurgie esthétique sans finalité thérapeutique est hors nomenclature :
// aucun remboursement, et TVA à 20 % — contrairement aux actes médicaux, qui en
// sont exonérés. C'est une mention que le devis doit porter.
// ---------------------------------------------------------------------------

const esthetique: NomenclatureSeed[] = [
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-INJ-BOTOX",
    label: "Injection de toxine botulique à visée esthétique",
    shortLabel: "Toxine botulique",
    specialty: "esthetique",
    category: "injection",
    reimbursable: false,
    notes: "Hors nomenclature : TVA 20 %. Délai de réflexion de 15 jours applicable.",
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-INJ-AH",
    label: "Injection d'acide hyaluronique à visée esthétique",
    shortLabel: "Acide hyaluronique",
    specialty: "esthetique",
    category: "injection",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-CHI-RHINO",
    label: "Rhinoplastie à visée esthétique",
    shortLabel: "Rhinoplastie esthétique",
    specialty: "esthetique",
    category: "chirurgie",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-CHI-BLEPHARO",
    label: "Blépharoplastie à visée esthétique",
    shortLabel: "Blépharoplastie esthétique",
    specialty: "esthetique",
    category: "chirurgie",
    reimbursable: false,
    notes:
      "Une blépharoplastie fonctionnelle (ptôsis avec gêne du champ visuel) relève de la CCAM : vérifier l'indication.",
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-CHI-LIPO",
    label: "Lipoaspiration à visée esthétique",
    shortLabel: "Lipoaspiration esthétique",
    specialty: "esthetique",
    category: "chirurgie",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-CHI-ABDO",
    label: "Abdominoplastie à visée esthétique",
    shortLabel: "Abdominoplastie esthétique",
    specialty: "esthetique",
    category: "chirurgie",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-CHI-MAMMAIRE",
    label: "Augmentation mammaire par implants à visée esthétique",
    shortLabel: "Augmentation mammaire esthétique",
    specialty: "esthetique",
    category: "chirurgie",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-LAS-EPIL",
    label: "Épilation par laser ou lumière pulsée",
    shortLabel: "Épilation laser",
    specialty: "esthetique",
    category: "laser",
    reimbursable: false,
  },
  {
    system: "HORS_NOMENCLATURE",
    code: "EST-PEEL",
    label: "Peeling chimique à visée esthétique",
    shortLabel: "Peeling",
    specialty: "esthetique",
    category: "dermatologie",
    reimbursable: false,
  },
  {
    system: "CCAM",
    code: "QZFA020",
    label: "Exérèse de lésion superficielle de la peau",
    shortLabel: "Exérèse lésion cutanée",
    specialty: "esthetique",
    category: "dermatologie",
    reimbursable: true,
    notes: "Acte thérapeutique : remboursable, exonéré de TVA. À distinguer de l'acte esthétique.",
  },
  {
    system: "CCAM",
    code: "QZNP001",
    label: "Séance de photothérapie dynamique cutanée",
    shortLabel: "Photothérapie dynamique",
    specialty: "esthetique",
    category: "dermatologie",
    reimbursable: true,
  },
];

export const NOMENCLATURE_SEED: NomenclatureSeed[] = [
  ...protheseDentaire,
  ...soinsDentaires,
  ...ngapDentaire,
  ...esthetique,
];

export const NOMENCLATURE_SEED_SOURCE = SOURCE;
