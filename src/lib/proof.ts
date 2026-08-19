import { canonicalHash } from "./crypto";

/**
 * Faisceau de preuves.
 *
 * C'est le cœur du produit. L'article L1111-2 du code de la santé publique
 * met la charge de la preuve de l'information sur le praticien : en cas de
 * litige, ce n'est pas au patient de démontrer qu'il n'a pas été informé,
 * c'est au praticien de démontrer qu'il l'a été.
 *
 * Un paraphe au bas d'un PDF ne prouve pas grand-chose. Ce qu'on assemble ici,
 * c'est un ensemble cohérent et daté : quel texte exact a été affiché (hash de
 * la version du formulaire), ce qui a été répondu (hash des réponses), combien
 * de temps le patient a passé sur chaque section, quelles déclarations il a
 * cochées et à quel instant, depuis quel appareil — le tout scellé par une
 * empreinte et rattaché à la chaîne d'audit.
 *
 * En v1 la signature reste de niveau simple (eIDAS). Ce faisceau est
 * précisément ce qui lui donne sa valeur probante devant un juge. Le passage
 * au niveau avancé via un prestataire de confiance français est prévu pour les
 * actes à fort enjeu.
 */

export const PROOF_SCHEMA_VERSION = 1;

export type SectionDwell = {
  sectionId: string;
  sectionTitle: string;
  /** Temps d'affichage cumulé, en millisecondes. */
  ms: number;
};

export type AcceptedStatement = {
  id: string;
  text: string;
  acceptedAt: string;
};

export type ProofInput = {
  submissionId: string;
  tenantName: string;
  form: {
    templateKey: string;
    title: string;
    version: number;
    /** Empreinte de la définition exactement telle qu'affichée. */
    contentHash: string;
  };
  answersHash: string;
  answersCount: number;
  patient: {
    displayName: string;
    birthDate?: string | null;
  };
  signer: {
    role: string;
    name: string;
    level: "simple" | "advanced" | "qualified";
  };
  statements: AcceptedStatement[];
  timeline: {
    sentAt?: Date | null;
    firstOpenedAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    signedAt: Date;
  };
  client: {
    ip?: string | null;
    userAgent?: string | null;
    locale?: string | null;
    timezoneOffsetMinutes?: number | null;
  };
  reading: SectionDwell[];
  otp?: {
    channel: "sms" | "email";
    destinationHint: string;
    verifiedAt: Date;
  } | null;
  /**
   * Pièce produite hors de Ryla et soumise à la signature (devis du logiciel
   * métier). Son empreinte est ce qui permet de démontrer, plus tard, que le
   * document annexé est bien celui qui a été affiché — et qu'il n'a pas été
   * remplacé depuis.
   */
  attachment?: ProofAttachment | null;
  /** Tête de la chaîne d'audit au moment de la signature. */
  auditChainHead: string | null;
};

export type ProofAttachment = {
  filename: string;
  sha256: string;
  byteSize: number;
  /** D'où vient la pièce, tel que déclaré par le cabinet. */
  source: string | null;
};

/**
 * Le bundle ne contient délibérément pas l'empreinte du PDF.
 *
 * Le PDF embarque le bundle en annexe : y inscrire sa propre empreinte serait
 * circulaire. Les deux scellements sont donc indépendants et se vérifient
 * séparément — `hash` scelle la preuve, et `signatures.document_hash` scelle
 * le PDF, l'un et l'autre étant consignés au journal d'audit.
 */
export type ProofBundle = {
  schemaVersion: number;
  generatedAt: string;
  submissionId: string;
  cabinet: string;
  document: ProofInput["form"];
  answers: { hash: string; count: number };
  patient: ProofInput["patient"];
  signer: ProofInput["signer"] & { signedAt: string };
  statements: AcceptedStatement[];
  timeline: Record<string, string | null>;
  client: ProofInput["client"];
  reading: {
    sections: SectionDwell[];
    totalMs: number;
  };
  otp: { channel: string; destinationHint: string; verifiedAt: string } | null;
  attachment: ProofAttachment | null;
  auditChainHead: string | null;
  /** Empreinte du bundle lui-même, calculée sur tout ce qui précède. */
  hash: string;
};

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function buildProofBundle(input: ProofInput): ProofBundle {
  const body = {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    submissionId: input.submissionId,
    cabinet: input.tenantName,
    document: input.form,
    answers: { hash: input.answersHash, count: input.answersCount },
    patient: input.patient,
    signer: { ...input.signer, signedAt: input.timeline.signedAt.toISOString() },
    statements: input.statements,
    timeline: {
      sentAt: iso(input.timeline.sentAt),
      firstOpenedAt: iso(input.timeline.firstOpenedAt),
      startedAt: iso(input.timeline.startedAt),
      completedAt: iso(input.timeline.completedAt),
      signedAt: input.timeline.signedAt.toISOString(),
    },
    client: input.client,
    reading: {
      sections: input.reading,
      totalMs: input.reading.reduce((sum, entry) => sum + entry.ms, 0),
    },
    otp: input.otp
      ? {
          channel: input.otp.channel,
          destinationHint: input.otp.destinationHint,
          verifiedAt: input.otp.verifiedAt.toISOString(),
        }
      : null,
    attachment: input.attachment ?? null,
    auditChainHead: input.auditChainHead,
  };

  return { ...body, hash: canonicalHash(body) };
}

/** Recalcule l'empreinte d'un bundle et la compare à celle qu'il porte. */
export function verifyProofBundle(bundle: ProofBundle): boolean {
  const { hash, ...body } = bundle;
  return canonicalHash(body) === hash;
}

// ---------------------------------------------------------------------------
// Mesure du parcours de lecture
// ---------------------------------------------------------------------------

export type RawDwellEvent = { sectionId: string; ms: number };

/**
 * Normalise les temps de lecture remontés par le navigateur.
 *
 * Ces valeurs viennent du client : elles sont donc plafonnées et jamais
 * présentées comme une mesure certifiée. Elles indiquent un ordre de grandeur
 * — « la section risques a été affichée 48 secondes » — ce qui, face à une
 * signature obtenue en quatre secondes, dit déjà beaucoup.
 */
export function normalizeDwell(
  events: RawDwellEvent[],
  sections: { id: string; title: string }[],
): SectionDwell[] {
  const MAX_MS = 2 * 3_600_000; // Deux heures : au-delà, l'onglet est resté ouvert.
  const totals = new Map<string, number>();

  for (const event of events) {
    if (!Number.isFinite(event.ms) || event.ms < 0) continue;
    const current = totals.get(event.sectionId) ?? 0;
    totals.set(event.sectionId, Math.min(MAX_MS, current + Math.round(event.ms)));
  }

  return sections.map((section) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    ms: totals.get(section.id) ?? 0,
  }));
}
