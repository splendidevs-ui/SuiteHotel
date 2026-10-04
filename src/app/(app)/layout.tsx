import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { AppNav } from "@/components/app-nav";
import { LogoutIcon, PlusIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { Avatar } from "@/components/ui";
import { isDirection, readSessionDraft, requireUser } from "@/lib/auth";
import { parseDraft } from "@/lib/booking-draft";
import { ROLE_META } from "@/lib/constants";
import { plural } from "@/lib/format";
import { getHotel } from "@/lib/hotel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [hotel, draft] = await Promise.all([getHotel(), readSessionDraft().then(parseDraft)]);
  const direction = isDirection(user);
  const subtitle = user.jobTitle ?? ROLE_META[user.role].label;
  // Reservation en cours dans la session : on la signale pour la reprendre depuis n'importe quel ecran.
  const draftRooms = draft?.rooms.length ?? 0;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink-950 text-ink-300 lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Link href="/" aria-label="Tableau de bord">
            <Logo tone="light" />
          </Link>
          <div className="mt-5 border-l border-gold-500/40 pl-3">
            <p className="truncate font-serif text-sm text-gold-200" title={hotel.name}>
              {hotel.name}
            </p>
            {hotel.tagline && <p className="truncate text-[0.7rem] text-ink-400">{hotel.tagline}</p>}
          </div>
        </div>
        <div className="space-y-2 px-3">
          <Link href="/reservations/nouvelle" className="btn btn-primary w-full">
            <PlusIcon /> {draftRooms > 0 ? "Reprendre la réservation" : "Nouvelle réservation"}
          </Link>
          {draftRooms > 0 && (
            <p className="px-1 text-center text-[0.7rem] text-gold-300">
              {plural(draftRooms, "chambre")} en cours · conservée dans votre session
            </p>
          )}
          <Link href="/devis/nouveau" className="btn w-full border-white/15 text-ink-200 hover:bg-white/5">
            <PlusIcon /> Nouveau devis
          </Link>
        </div>
        <div className="mt-5 flex-1 overflow-y-auto px-3">
          <AppNav isDirection={direction} restaurant={hotel.restaurantEnabled} />
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-ink-400">{subtitle}</p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-white"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogoutIcon className="size-[1.1rem]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <MobileNav
        isDirection={direction}
        restaurant={hotel.restaurantEnabled}
        userName={user.name}
        subtitle={`${subtitle} · ${hotel.name}`}
        draftRooms={draftRooms}
      />

      <main className="print-full mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
