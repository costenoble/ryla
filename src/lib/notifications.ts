/**
 * Notifications sortantes.
 *
 * Règle non négociable : aucun message sortant ne contient de donnée de santé,
 * ni dans le corps, ni en pièce jointe, ni dans l'objet.
 *
 * L'objet compte autant que le corps. « Dr Martin — votre questionnaire
 * pré-opératoire » révèle par inférence qu'une intervention est prévue : c'est
 * déjà une donnée de santé, et l'email ordinaire n'est pas un canal conforme à
 * l'article 32 du RGPD pour ce type d'information. Les alternatives admises
 * sont MSSanté ou un portail sécurisé — Ryla est le portail, l'email ne
 * transporte que le lien.
 *
 * Corollaire côté praticien : on notifie « un document est prêt », jamais le
 * PDF en pièce jointe.
 *
 * C'est une contrainte, et c'est aussi l'argument commercial : zéro donnée de
 * santé dans les emails du cabinet.
 */

import { env } from "./env";

export type OutboundMessage = {
  to: string;
  subject: string;
  body: string;
  /** Trace d'audit : ce qui a été envoyé, sans jamais le contenu médical. */
  kind: string;
  /**
   * Nom affiché à la place de « Ryla ». Le patient reconnaît son cabinet, pas
   * un éditeur dont il n'a jamais entendu parler — c'est ce qui fait qu'il
   * ouvre le message au lieu de le signaler comme indésirable.
   *
   * Seul le libellé change : le domaine d'envoi reste celui de Ryla, sans quoi
   * SPF et DKIM échoueraient et le message n'arriverait pas du tout.
   */
  senderLabel?: string | null;
};

export type Notifier = {
  send(message: OutboundMessage): Promise<void>;
};

// ---------------------------------------------------------------------------
// Gabarits
// ---------------------------------------------------------------------------

export function patientInvitation(params: {
  to: string;
  cabinetName: string;
  url: string;
  expiresAt: Date;
}): OutboundMessage {
  const deadline = params.expiresAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    to: params.to,
    kind: "patient_invitation",
    senderLabel: params.cabinetName,
    // Ni le motif, ni la spécialité, ni le type de document.
    subject: "Vous avez un document à compléter",
    body: [
      "Bonjour,",
      "",
      `${params.cabinetName} vous invite à compléter un document en ligne.`,
      "",
      params.url,
      "",
      `Ce lien est personnel et reste valable jusqu'au ${deadline}.`,
      "Ne le transmettez à personne.",
      "",
      "Si vous pensez avoir reçu ce message par erreur, ignorez-le.",
    ].join("\n"),
  };
}

export function patientReminder(params: {
  to: string;
  cabinetName: string;
  url: string;
}): OutboundMessage {
  return {
    to: params.to,
    kind: "patient_reminder",
    senderLabel: params.cabinetName,
    subject: "Rappel : un document reste à compléter",
    body: [
      "Bonjour,",
      "",
      `Le document transmis par ${params.cabinetName} n'a pas encore été complété.`,
      "",
      params.url,
      "",
      "Ce lien est personnel. Ne le transmettez à personne.",
    ].join("\n"),
  };
}

export function practitionerNotification(params: {
  to: string;
  dashboardUrl: string;
  patientInitials: string;
}): OutboundMessage {
  return {
    to: params.to,
    kind: "practitioner_notification",
    // Initiales seulement, et surtout aucune pièce jointe.
    subject: `Un document est prêt (${params.patientInitials})`,
    body: [
      "Bonjour,",
      "",
      "Un document a été complété et signé. Il est consultable depuis votre espace :",
      "",
      params.dashboardUrl,
      "",
      "Conformément à notre politique de sécurité, aucun contenu médical n'est",
      "transmis par email.",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/** Transport de développement : écrit dans la console, n'envoie rien. */
export const consoleNotifier: Notifier = {
  async send(message) {
    console.log(
      [
        "",
        "─".repeat(72),
        `À        : ${message.to}`,
        `Objet    : ${message.subject}`,
        "─".repeat(72),
        message.body,
        "─".repeat(72),
        "",
      ].join("\n"),
    );
  },
};

/**
 * Compose l'en-tête `From`.
 *
 * On garde l'adresse configurée et on ne remplace que le libellé : envoyer
 * depuis le domaine du cabinet ferait échouer SPF et DKIM, et le message
 * n'arriverait pas. « Cabinet Martin (via Ryla) » dit la vérité au patient et
 * passe les filtres.
 */
export function composeFrom(configured: string, senderLabel?: string | null): string {
  if (!senderLabel) return configured;
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured;
  // Les retours chariot deviennent des espaces plutôt que de disparaître :
  // supprimés, ils colleraient deux mots et masqueraient l'injection au lieu
  // de la rendre lisible dans le libellé.
  const clean = senderLabel
    .replace(/["<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return configured;
  return `"${clean} (via Ryla)" <${address}>`;
}

/**
 * Transport SMTP.
 *
 * Créé une seule fois et mémorisé sur `globalThis`, pour les mêmes raisons que
 * le pool PostgreSQL : en développement, le rechargement à chaud rejoue les
 * modules et ouvrirait une connexion de plus à chaque envoi.
 */
type GlobalWithMail = typeof globalThis & {
  __rylaMailer?: import("nodemailer").Transporter;
};

async function smtpNotifier(): Promise<Notifier> {
  const nodemailer = (await import("nodemailer")).default;
  const globalRef = globalThis as GlobalWithMail;

  if (!globalRef.__rylaMailer) {
    const config = env.smtp;
    globalRef.__rylaMailer = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      pool: true,
      maxConnections: 2,
    });
  }

  const transport = globalRef.__rylaMailer;

  return {
    async send(message) {
      await transport.sendMail({
        from: composeFrom(env.mailFrom, message.senderLabel),
        to: message.to,
        subject: message.subject,
        text: message.body,
        replyTo: env.mailReplyTo ?? undefined,
        headers: {
          // Un lien vers un dossier de santé n'a rien à faire dans un cache de
          // proxy, une prévisualisation ou un index de moteur de recherche.
          "X-Auto-Response-Suppress": "All",
          "Auto-Submitted": "auto-generated",
        },
      });
    },
  };
}

let override: Notifier | null = null;

/** Point d'injection pour les tests. */
export function setNotifier(next: Notifier | null): void {
  override = next;
}

export async function getNotifier(): Promise<Notifier> {
  if (override) return override;
  if (env.mailDriver === "smtp") return smtpNotifier();
  return consoleNotifier;
}

/**
 * Envoie sans jamais faire échouer l'action appelante.
 *
 * Un relais SMTP indisponible ne doit pas annuler la création d'un dossier :
 * le lien reste affiché à l'écran et le praticien peut le transmettre
 * lui-même. L'échec est remonté au lieu d'être avalé, pour que l'interface
 * puisse le dire plutôt que de laisser croire à un envoi.
 */
export async function trySend(
  message: OutboundMessage,
): Promise<{ sent: boolean; error: string | null }> {
  try {
    const notifier = await getNotifier();
    await notifier.send(message);
    return { sent: true, error: null };
  } catch (error) {
    console.error("[notifications] échec de l'envoi", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Envoi impossible.",
    };
  }
}
