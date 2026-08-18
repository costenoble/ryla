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
  notes?: string;
};

const SOURCE = "Jeu de départ Ryla — codes et libellés uniquement, tarifs à importer";

// ---------------------------------------------------------------------------
// Dentaire — prothèse
// ---------------------------------------------------------------------------

const protheseDentaire: NomenclatureSeed[] = [
  {
    system: "CCAM",
    code: "HBLD038",
    label: "Pose d'une couronne dentaire dentoportée céramométallique",
    shortLabel: "Couronne céramométallique",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
    notes:
      "Panier selon la dent : 100 % santé sur incisives, canines et prémolaires ; tarifs maîtrisés au-delà.",
  },
  {
    system: "CCAM",
    code: "HBLD036",
    label: "Pose d'une couronne dentaire dentoportée métallique",
    shortLabel: "Couronne métallique",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
  },
  {
    system: "CCAM",
    code: "HBLD033",
    label: "Pose d'une couronne dentaire dentoportée céramique monolithique",
    shortLabel: "Couronne zircone / céramique",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
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

const ngapDentaire: NomenclatureSeed[] = [
  {
    system: "NGAP",
    code: "SC",
    label: "Soins conservateurs (lettre-clé SC, tarifée au coefficient)",
    shortLabel: "SC — soins conservateurs",
    specialty: "dentaire",
    category: "conservateur",
    reimbursable: true,
    ngapKey: "SC",
  },
  {
    system: "NGAP",
    code: "SPR",
    label: "Soins prothétiques (lettre-clé SPR, tarifée au coefficient)",
    shortLabel: "SPR — prothèse",
    specialty: "dentaire",
    category: "prothese",
    reimbursable: true,
    ngapKey: "SPR",
  },
  {
    system: "NGAP",
    code: "TO",
    label: "Traitement d'orthopédie dento-faciale (lettre-clé TO)",
    shortLabel: "TO — orthodontie",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "TO",
    notes:
      "Prise en charge sous condition d'âge et d'entente préalable. Semestre de traitement actif.",
  },
  {
    system: "NGAP",
    code: "ORT",
    label: "Séance de surveillance d'orthopédie dento-faciale (lettre-clé ORT)",
    shortLabel: "ORT — surveillance",
    specialty: "dentaire",
    category: "orthodontie",
    reimbursable: true,
    ngapKey: "ORT",
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
