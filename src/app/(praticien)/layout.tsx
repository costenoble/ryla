import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { IconLogout, IconShield } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { requireSession } from "@/lib/auth";
import { logout } from "../connexion/actions";

export const dynamic = "force-dynamic";

/**
 * Coque de l'espace praticien.
 *
 * Un panneau indigo détaché du bord — le fond clair reste visible tout autour,
 * ce qui donne à l'application une profondeur que le plein cadre n'a pas. La
 * colonne est fixe : sur un poste de cabinet, la navigation ne doit jamais
 * défiler hors de portée.
 */
export default async function PraticienLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const initials = session.user.fullName
    .replace(/^(Dr|Pr)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-dvh lg:flex">
      {/* --- Colonne latérale (à partir de lg) ------------------------------ */}
      <aside className="hidden shrink-0 p-3 lg:block lg:w-[286px]">
        <div className="ink-panel sticky top-3 flex h-[calc(100dvh-1.5rem)] flex-col rounded-3xl p-4 shadow-ink">
          <Link href="/tableau-de-bord" className="mb-7 block px-2 pt-2">
            <Logo tone="light" size="md" withTagline />
          </Link>

          <AppNav />

          <div className="mt-auto">
            <div className="mb-3 rounded-2xl bg-white/6 p-3.5 ring-1 ring-white/10 ring-inset">
              <div className="flex items-center gap-2 text-flame-400">
                <IconShield className="size-4" />
                <span className="text-xs font-semibold">Données chiffrées</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                Réponses chiffrées par cabinet. Chaque consultation de dossier est
                journalisée.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl p-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-xs font-bold text-white ring-1 ring-white/15 ring-inset">
                {initials || "??"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">
                  {session.user.fullName}
                </span>
                <span className="block truncate text-xs text-ink-300">
                  {session.tenant.name}
                </span>
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  title="Se déconnecter"
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-300 transition hover:bg-white/10 hover:text-white"
                >
                  <IconLogout className="size-[18px]" />
                  <span className="sr-only">Se déconnecter</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* --- Barre compacte (mobile et tablette) ---------------------------- */}
      <header className="ink-panel sticky top-0 z-30 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/tableau-de-bord">
            <Logo tone="light" size="sm" />
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-300 transition hover:bg-white/10 hover:text-white"
            >
              <IconLogout className="size-[18px]" />
              <span className="sr-only">Se déconnecter</span>
            </button>
          </form>
        </div>
        <div className="mt-3">
          <AppNav compact />
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-9 lg:pr-8 lg:pl-3">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
