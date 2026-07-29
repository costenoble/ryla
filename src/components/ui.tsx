import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Primitives d'interface.
 *
 * Peu de composants, très réutilisés — c'est ce qui donne à un produit l'air
 * d'avoir été dessiné d'un seul tenant. Les rayons et les ombres viennent des
 * jetons de `globals.css` ; aucun hexadécimal en dur ici.
 */

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cx(
        "rounded-2xl border border-line bg-surface shadow-tile",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-body">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-body">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full " +
  "text-sm font-semibold transition duration-200 ease-[var(--ease-out-expo)] " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const BUTTON_VARIANTS = {
  // Bleu pour les actions : l'orange reste un signal, pas une commodité.
  primary:
    "bg-brand-600 text-white shadow-tile hover:bg-brand-700 hover:shadow-card active:scale-[0.98]",
  accent:
    "bg-flame-600 text-white shadow-tile hover:bg-flame-700 hover:shadow-card active:scale-[0.98]",
  ghost: "text-muted hover:bg-canvas hover:text-body",
  outline:
    "border border-line-strong bg-surface text-body hover:border-brand-300 hover:bg-brand-50/60",
  ink: "bg-ink-900 text-white hover:bg-ink-800 active:scale-[0.98]",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 px-4",
  md: "h-11 px-5",
  lg: "h-12 px-6 text-[15px]",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
  className?: string,
): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <button {...rest} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const BADGE_TONES = {
  neutral: "bg-canvas text-muted ring-line",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  flame: "bg-flame-50 text-flame-700 ring-flame-100",
  positive: "bg-positive-soft text-positive ring-emerald-100",
  caution: "bg-caution-soft text-caution ring-amber-100",
  danger: "bg-danger-soft text-danger ring-red-100",
  ink: "bg-ink-900/5 text-ink-800 ring-ink-900/10",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// États vides
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          {icon}
        </div>
      ) : null}
      <p className="font-semibold text-body">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------

export const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] " +
  "text-body shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] transition " +
  "placeholder:text-faint focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-body">
        {label}
        {/* L'astérisque seule ne suffit pas pour un lecteur d'écran. */}
        {required ? (
          <span className="text-flame-600">
            {" *"}
            <span className="sr-only"> (obligatoire)</span>
          </span>
        ) : null}
      </label>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

/** Ligne clé / valeur des panneaux latéraux. */
export function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span
        className={cx(
          "truncate text-right text-sm font-medium text-body",
          mono && "font-mono text-[11px] tracking-tight",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
