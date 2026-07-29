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
  get appBaseUrl() {
    return optional("APP_BASE_URL", "http://localhost:3000");
  },
  get tenantDomain() {
    return optional("APP_TENANT_DOMAIN", "localhost:3000");
  },
  get magicLinkTtlHours() {
    return Number(optional("MAGIC_LINK_TTL_HOURS", "168"));
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
   * Exécution serverless : chaque instance est un processus court-vivant, et
   * il peut y en avoir des centaines en parallèle. Garder un pool étroit évite
   * de saturer les connexions de la base.
   */
  get isServerless() {
    return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  },
};
