/**
 * Accès centralisé à la configuration.
 *
 * Tout est lu paresseusement : Next.js construit certaines pages sans
 * variables d'environnement, et on ne veut pas faire échouer un build sur une
 * clé qui n'est nécessaire qu'à l'exécution.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get databaseAdminUrl() {
    return process.env.DATABASE_ADMIN_URL ?? required("DATABASE_URL");
  },
  /** KEK maître. En production : KMS du prestataire HDS, pas une variable. */
  get kek() {
    return required("RYLA_KEK");
  },
  get tokenSecret() {
    return required("RYLA_TOKEN_SECRET");
  },
  /**
   * URL publique de l'application, celle qui construit les liens patients.
   *
   * `APP_BASE_URL` reste prioritaire — c'est elle qu'on renseignera avec le
   * domaine définitif. À défaut, on retombe sur le domaine que Vercel expose
   * de lui-même, ce qui évite d'avoir à connaître l'URL avant le premier
   * déploiement.
   *
   * `VERCEL_PROJECT_PRODUCTION_URL` d'abord, et pas `VERCEL_URL` : la seconde
   * change à chaque déploiement. Un lien envoyé à un patient lundi doit encore
   * s'ouvrir vendredi, après trois mises en ligne.
   */
  get appBaseUrl() {
    const explicit = process.env.APP_BASE_URL;
    if (explicit) return explicit;

    const vercelHost =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    if (vercelHost) return `https://${vercelHost}`;

    return "http://localhost:3000";
  },
  get tenantDomain() {
    const explicit = process.env.APP_TENANT_DOMAIN;
    if (explicit) return explicit;

    const vercelHost =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    if (vercelHost) return vercelHost;

    return "localhost:3000";
  },
  /**
   * `APP_TENANT_DOMAIN` tel que réellement configuré, sans le repli sur le
   * domaine Vercel du déploiement.
   *
   * Sert à décider si le portail patient doit prendre la forme d'un
   * sous-domaine par cabinet. Un domaine personnalisé (`ryla.fr`) avec un
   * DNS générique (`*.ryla.fr`) le permet ; le domaine `*.vercel.app` d'un
   * déploiement, non — Vercel ne route que l'alias exact configuré, pas des
   * sous-domaines arbitraires en dessous. Sans cette distinction,
   * `cabinet-martin.ryla-one.vercel.app` est généré et n'importe jamais nulle
   * part, alors qu'aucune erreur ne le signale au moment de l'émission.
   */
  get hasCustomTenantDomain() {
    return Boolean(process.env.APP_TENANT_DOMAIN);
  },
  get magicLinkTtlHours() {
    return Number(optional("MAGIC_LINK_TTL_HOURS", "168"));
  },
  /**
   * Transport des notifications sortantes.
   *
   * `console` par défaut, et c'est délibéré : un environnement mal configuré
   * doit écrire dans les journaux, jamais partir dans la nature. On active
   * l'envoi réel en le demandant explicitement.
   */
  get mailDriver() {
    return optional("MAIL_DRIVER", "console");
  },
  /**
   * SMTP plutôt que l'API d'un prestataire : c'est le seul protocole que tous
   * savent parler. Changer de fournisseur — y compris pour le relais d'OVH au
   * moment de la bascule HDS — se fait en changeant ces variables, pas le code.
   */
  get smtp() {
    return {
      host: required("SMTP_HOST"),
      port: Number(optional("SMTP_PORT", "587")),
      user: process.env.SMTP_USER ?? null,
      password: process.env.SMTP_PASSWORD ?? null,
      // 465 est le port du TLS implicite ; 587 fait un STARTTLS après connexion.
      secure: optional("SMTP_SECURE", "") === "true" || optional("SMTP_PORT", "587") === "465",
    };
  },
  /**
   * Expéditeur des emails.
   *
   * L'adresse appartient à Ryla, pas au cabinet : usurper le domaine du
   * praticien ferait échouer SPF et DKIM, et les messages finiraient en
   * indésirables — c'est-à-dire que le patient ne recevrait jamais son lien.
   * Le nom du cabinet apparaît dans le libellé, pas dans le domaine.
   */
  get mailFrom() {
    return optional("MAIL_FROM", "Ryla <ne-pas-repondre@ryla.fr>");
  },
  get mailReplyTo() {
    return process.env.MAIL_REPLY_TO ?? null;
  },
  /**
   * `postgres` par défaut : c'est le seul pilote qui fonctionne partout, y
   * compris sur une plateforme serverless au système de fichiers éphémère.
   */
  get storageDriver() {
    return optional("STORAGE_DRIVER", "postgres");
  },
  get storageLocalDir() {
    return optional("STORAGE_LOCAL_DIR", "./storage");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  /**
   * Affiche la liste des cabinets sur l'écran de connexion.
   *
   * Réservé aux environnements de démonstration : en exploitation réelle,
   * chaque cabinet a son sous-domaine et l'énumération publique des cabinets
   * n'a pas lieu d'être.
   */
  get showTenantPicker() {
    return process.env.RYLA_TENANT_PICKER === "on";
  },
  /**
   * Code d'invitation exigé à l'inscription.
   *
   * Un formulaire public qui crée des espaces destinés à recevoir des données
   * de santé n'a rien d'anodin. Sans cette variable, l'inscription en ligne est
   * indisponible en production — échec fermé, comme le RLS. En développement
   * elle reste ouverte, parce qu'on y crée des cabinets à la chaîne.
   */
  get signupCode() {
    return process.env.RYLA_SIGNUP_CODE ?? null;
  },
  /**
   * Exécution serverless : chaque instance est un processus court-vivant, et
   * il peut y en avoir des centaines en parallèle. Garder un pool étroit évite
   * de saturer les connexions de la base.
   */
  get isServerless() {
    return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  },
};
