import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

/**
 * Figtree : géométrique, un peu arrondie, très lisible en petit corps. Elle
 * accompagne le symbole du logo sans lui faire concurrence, et reste sobre là
 * où le contenu est médical.
 */
const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Ryla", template: "%s · Ryla" },
  description:
    "Questionnaires, consentements et devis conformes — avec le dossier de preuve qui va avec.",
  // Aucune page de Ryla n'a vocation à être indexée : les URL de portail
  // patient sont des secrets.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1a0844",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
