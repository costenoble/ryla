import { missingLegalFields } from "@/lib/legal-entity";

/**
 * Primitives des pages légales.
 *
 * Un texte juridique se lit mal en pleine largeur : la mesure est bornée à
 * environ 70 caractères, et l'interlignage est généreux. Ce sont des pages
 * qu'on consulte pour vérifier un point précis, pas qu'on parcourt.
 */

export function LegalPage({
  title,
  updatedOn,
  intro,
  children,
}: {
  title: string;
  updatedOn: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-balance text-body">
          {title}
        </h1>
        <p className="tabular mt-2 text-sm text-faint">
          Version en vigueur au {updatedOn}
        </p>
        {intro ? (
          <p className="mt-5 text-[15px] leading-relaxed text-muted">{intro}</p>
        ) : null}
      </header>

      <IncompleteNotice />

      <div className="space-y-9">{children}</div>
    </article>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold tracking-tight text-body">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

/** Paire libellé / valeur, pour les mentions à énumérer. */
export function LegalRow({ label, value }: { label: string; value: string }) {
  const missing = value === "à compléter";
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line py-2.5 last:border-0">
      <dt className="w-52 shrink-0 font-medium text-body">{label}</dt>
      <dd className={missing ? "font-semibold text-flame-700" : "text-muted"}>{value}</dd>
    </div>
  );
}

/**
 * Bandeau d'avertissement tant que l'identité de l'éditeur n'est pas renseignée.
 *
 * Volontairement voyant. Une mention légale incomplète est une infraction à
 * l'article 6-III de la LCEN, et un placeholder discret finit toujours par
 * passer en production sans que personne ne le voie.
 */
function IncompleteNotice() {
  const missing = missingLegalFields();
  if (missing.length === 0) return null;

  return (
    <div className="mb-10 rounded-2xl border-2 border-flame-600 bg-flame-50 p-5">
      <p className="font-bold text-flame-700">
        Page incomplète — à ne pas mettre en ligne en l'état
      </p>
      <p className="mt-2 text-sm leading-relaxed text-flame-700">
        Ces mentions sont obligatoires (art. 6-III de la LCEN) et leur absence est
        sanctionnée. Renseignez <code className="font-mono">src/lib/legal-entity.ts</code>{" "}
        avant l'ouverture au public.
      </p>
      <p className="mt-2.5 text-sm font-semibold text-flame-700">
        Manquant : {missing.join(", ")}.
      </p>
    </div>
  );
}
