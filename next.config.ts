import type { NextConfig } from "next";

/**
 * Politique de sécurité du contenu.
 *
 * `'unsafe-inline'` sur les scripts est le prix du rendu de Next : le payload
 * React Server Components arrive dans des balises `<script>` en ligne, et les
 * remplacer par des empreintes demanderait un nonce propagé partout — donc de
 * renoncer au rendu statique. Le compromis est assumé et documenté ici plutôt
 * que subi ailleurs.
 *
 * Ce qui compte vraiment tient dans les trois dernières directives :
 *  • `connect-src 'self'` — aucune donnée de santé ne peut être exfiltrée vers
 *    un tiers par un script injecté ;
 *  • `frame-ancestors 'none'` — le portail patient ne peut pas être encadré
 *    dans une page qui se ferait passer pour le cabinet ;
 *  • `form-action 'self'` — un formulaire de signature ne peut pas être
 *    détourné vers un autre serveur.
 *
 * `data:` est admis pour les images : la signature manuscrite du patient est
 * une image encodée en ligne avant d'être envoyée.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Aucune donnée de santé ne doit fuiter via des en-têtes de cache ou des
  // référents sortants. Le portail patient est servi en no-store (cf. headers).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Deux ans, sous-domaines compris : chaque cabinet a le sien, et un
          // seul aller-retour en clair suffirait à intercepter un lien patient.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: CSP,
          },
        ],
      },
      {
        // Le lien magique ne doit jamais être mis en cache par un proxy.
        source: "/formulaire/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
