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

export type OutboundMessage = {
  to: string;
  subject: string;
  body: string;
  /** Trace d'audit : ce qui a été envoyé, sans jamais le contenu médical. */
  kind: string;
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

let notifier: Notifier = consoleNotifier;

export function setNotifier(next: Notifier): void {
  notifier = next;
}

export function getNotifier(): Notifier {
  return notifier;
}
