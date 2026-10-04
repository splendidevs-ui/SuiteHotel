"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { AppNav } from "./app-nav";
import { CloseIcon, LogoutIcon, MenuIcon, PlusIcon } from "./icons";
import { Logo } from "./logo";

export function MobileNav({
  isDirection,
  restaurant,
  userName,
  subtitle,
  draftRooms,
}: {
  isDirection: boolean;
  restaurant: boolean;
  userName: string;
  subtitle: string;
  /** Chambres de la reservation en cours (session), 0 s'il n'y en a pas. */
  draftRooms: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="no-print sticky top-0 z-30 bg-ink-950 text-white lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Tableau de bord">
          <Logo tone="light" />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/reservations/nouvelle" className="btn btn-primary btn-sm">
            <PlusIcon /> {draftRooms > 0 ? `Reprendre (${draftRooms})` : "Réserver"}
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-white"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/10 px-3 pb-4 pt-3">
          <AppNav isDirection={isDirection} restaurant={restaurant} onNavigate={() => setOpen(false)} />
          <Link
            href="/devis/nouveau"
            onClick={() => setOpen(false)}
            className="btn mt-3 w-full border-white/15 text-ink-200 hover:bg-white/5"
          >
            <PlusIcon /> Nouveau devis
          </Link>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 px-1 pt-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="truncate text-xs text-ink-400">{subtitle}</p>
            </div>
            <form action={logout}>
              <button type="submit" className="btn btn-sm border-white/15 text-ink-200 hover:bg-white/5">
                <LogoutIcon /> Déconnexion
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
