import Image from "next/image";
import { cx } from "./ui";

/**
 * Marque Ryla.
 *
 * Le symbole vient du fichier source détouré ; le mot-clé est composé en
 * Figtree plutôt qu'en image, pour rester net à toutes les tailles, se colorer
 * selon le fond et rester sélectionnable.
 */

const SIZES = {
  sm: { px: 24, text: "text-base" },
  md: { px: 30, text: "text-lg" },
  lg: { px: 40, text: "text-2xl" },
} as const;

export function Logo({
  size = "md",
  tone = "dark",
  withWordmark = true,
  withTagline = false,
  className,
}: {
  size?: keyof typeof SIZES;
  /** `dark` pour un fond clair, `light` pour une surface indigo. */
  tone?: "dark" | "light";
  withWordmark?: boolean;
  withTagline?: boolean;
  className?: string;
}) {
  const { px, text } = SIZES[size];

  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/ryla-mark.png"
        alt=""
        width={px}
        height={Math.round(px * 0.8)}
        priority
        className="shrink-0 select-none"
      />
      {withWordmark ? (
        <span className="leading-none">
          <span
            className={cx(
              "block font-extrabold tracking-tight",
              text,
              tone === "light" ? "text-white" : "text-ink-900",
            )}
          >
            Ryla
          </span>
          {withTagline ? (
            <span
              className={cx(
                "mt-0.5 block text-[11px] font-medium",
                tone === "light" ? "text-ink-300" : "text-muted",
              )}
            >
              Le cabinet zéro papier
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
