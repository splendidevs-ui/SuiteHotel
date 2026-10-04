"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BedIcon,
  CalendarIcon,
  DocumentIcon,
  DoorIcon,
  HomeIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  UtensilsIcon,
} from "./icons";

const ITEMS = [
  { href: "/", label: "Tableau de bord", icon: HomeIcon },
  { href: "/planning", label: "Planning", icon: CalendarIcon },
  { href: "/reservations", label: "Réservations", icon: BedIcon },
  { href: "/devis", label: "Devis", icon: DocumentIcon },
  { href: "/recus", label: "Reçus", icon: ReceiptIcon },
  { href: "/clients", label: "Clients", icon: UsersIcon },
  { href: "/restaurant", label: "Restaurant", icon: UtensilsIcon, restaurant: true },
  { href: "/chambres", label: "Chambres", icon: DoorIcon },
  { href: "/equipe", label: "Équipe", icon: ShieldIcon, direction: true },
  { href: "/parametres", label: "Paramètres", icon: SettingsIcon },
];

/** Navigation principale, sur fond sombre (barre laterale et menu mobile). */
export function AppNav({
  isDirection,
  restaurant,
  onNavigate,
}: {
  isDirection: boolean;
  restaurant: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => (!item.direction || isDirection) && (!item.restaurant || restaurant));
  return (
    <nav className="space-y-0.5" aria-label="Navigation principale">
      {items.map(({ href, label, icon: Icon, direction }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-white/[0.07] text-gold-300" : "text-ink-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" aria-hidden="true" />}
            <Icon className="size-[1.1rem]" />
            <span className="flex-1">{label}</span>
            {direction && (
              <span className="rounded bg-gold-500/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-gold-300">
                Dir.
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
