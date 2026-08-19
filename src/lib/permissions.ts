/**
 * Droits par rôle.
 *
 * Les trois rôles existaient en base depuis le début — `owner`, `practitioner`,
 * `assistant` — et n'étaient testés nulle part : une assistante avait
 * exactement les mêmes pouvoirs que le titulaire, dont la lecture de tous les
 * dossiers médicaux. Pour un produit dont le journal d'accès est un argument de
 * vente, c'était incohérent.
 *
 * Le découpage suit ce que fait réellement un cabinet, pas une hiérarchie
 * abstraite :
 *
 *  • une assistante inscrit les patients, envoie les questionnaires et suit les
 *    règlements — c'est son métier, et le lui interdire rendrait le produit
 *    inutilisable au comptoir ;
 *  • elle n'a pas à lire les réponses de santé ni à télécharger un consentement
 *    signé. Le secret médical n'est pas une affaire de confiance envers la
 *    personne, c'est une affaire de périmètre ;
 *  • les réglages du cabinet et la gestion des comptes restent au titulaire :
 *    ce sont les mentions légales dont il est responsable au sens du RGPD.
 *
 * Les droits sont vérifiés côté serveur, dans les actions et les pages. Masquer
 * un bouton n'a jamais protégé une donnée.
 */

export type Role = "owner" | "practitioner" | "assistant";

export const CAPABILITIES = [
  /** Voir et modifier l'état civil des patients. */
  "patients.write",
  /** Envoyer un document à un patient, renvoyer un lien. */
  "submissions.send",
  /** Lire les réponses de santé et télécharger les documents signés. */
  "health.read",
  /** Créer, modifier et archiver les modèles de formulaire. */
  "templates.write",
  /** Établir et envoyer des devis, saisir les règlements. */
  "quotes.write",
  /** Modifier le référentiel d'actes du cabinet. */
  "nomenclature.write",
  /** Réglages du cabinet : identité, en-tête, mentions légales, DPO. */
  "settings.write",
  /** Effacement et export des données d'un patient (RGPD). */
  "patients.erase",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: CAPABILITIES,
  practitioner: [
    "patients.write",
    "submissions.send",
    "health.read",
    "templates.write",
    "quotes.write",
    "nomenclature.write",
  ],
  assistant: ["patients.write", "submissions.send", "quotes.write"],
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Libellés affichés, pour expliquer un refus plutôt que de le subir. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Titulaire",
  practitioner: "Praticien",
  assistant: "Assistant(e)",
};

export class Forbidden extends Error {
  constructor(readonly capability: Capability) {
    super(
      "Votre rôle ne permet pas cette action. Demandez au titulaire du cabinet " +
        "de la réaliser, ou de faire évoluer vos droits.",
    );
    this.name = "Forbidden";
  }
}

/** Lève `Forbidden` si le rôle ne porte pas le droit demandé. */
export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw new Forbidden(capability);
}
