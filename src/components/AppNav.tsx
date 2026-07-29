"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconFolder,
  IconReceipt,
  IconTemplate,
  type IconProps,
} from "./icons";
import { cx } from "./ui";

/**
 * Navigation principale.
 *
 * L'onglet actif est signalé par une pastille qui glisse d'un élément à
 * l'autre (`layoutId`) plutôt que d'apparaître brutalement : le déplacement
 * dit d'où l'on vient, ce qu'un simple changement de couleur ne dit pas.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
};

const ITEMS: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", Icon: IconDashboard },
  { href: "/dossiers", label: "Dossiers", Icon: IconFolder },
  { href: "/devis", label: "Devis", Icon: IconReceipt },
  { href: "/modeles", label: "Modèles", Icon: IconTemplate },
];

function useActive(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
  const active = useActive(item.href);
  const { Icon } = item;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-3 rounded-xl px-3 font-medium transition-colors duration-200",
        compact ? "h-10 text-sm" : "h-11 text-[15px]",
        active ? "text-white" : "text-ink-300 hover:text-white",
      )}
    >
      {active ? (
        <motion.span
          layoutId={compact ? "nav-pill-compact" : "nav-pill"}
          className="absolute inset-0 rounded-xl bg-white/12 ring-1 ring-white/12 ring-inset"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      ) : null}
      <Icon className={cx("relative size-[18px]", active && "text-flame-400")} />
      <span className="relative whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export function AppNav({ compact }: { compact?: boolean }) {
  return (
    <nav
      className={cx(
        compact ? "flex gap-1 overflow-x-auto scroll-slim" : "flex flex-col gap-1",
      )}
    >
      {ITEMS.map((item) => (
        <NavLink key={item.href} item={item} compact={compact} />
      ))}
    </nav>
  );
}
