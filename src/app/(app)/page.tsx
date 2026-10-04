import type { Metadata } from "next";
import Link from "next/link";
import { checkInAction, checkOutAction } from "./reservations/actions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { ArrowRightIcon, CalendarIcon, LoginIcon, LogoutIcon, PlusIcon, StarIcon } from "@/components/icons";
import { Badge, CardHeader, EmptyState, Meter, PageHeader, ReservationBadge, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDayMonth, formatTime, guestName, plural, todayDate } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatMoney } from "@/lib/money";
import { getDashboard } from "@/lib/queries";
import { nightsBetween, stayLength } from "@/lib/stay-math";

export const metadata: Metadata = { title: "Tableau de bord" };

const LATE = "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";

function roomNumbers(rooms: { room: { number: string } }[]) {
  return rooms.map((r) => r.room.number).join(", ");
}

function persons(rooms: { adults: number; children: number }[]) {
  return rooms.reduce((sum, r) => sum + r.adults + r.children, 0);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [hotel, d] = await Promise.all([getHotel(), getDashboard()]);
  const cur = hotel.currency;
  const hour = Number(formatTime(new Date()).slice(0, 2));
  const greeting = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
  const occupancy = d.rooms.inService ? d.rooms.occupied / d.rooms.inService : 0;
  const late = d.arrivals.filter((a) => a.late).length;
  const unpaid = d.departures.filter((x) => x.balance > 0).length;

  const shortcuts = [
    { href: "/reservations?vue=en-sejour", label: "Clients en séjour", value: d.inHouse.guests },
    { href: "/devis?statut=ENVOYE", label: "Devis en attente de réponse", value: d.pendingQuotes },
    ...(hotel.restaurantEnabled ? [{ href: "/restaurant", label: "Additions en cours", value: d.openOrders }] : []),
    { href: "/chambres", label: "Chambres hors service", value: d.rooms.outOfService },
  ];

  return (
    <>
      <PageHeader
        eyebrow={formatDate(todayDate(), { weekday: "long" })}
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`Voici la journée de la réception — ${hotel.name}.`}
        actions={
          <>
            <Link href="/planning" className="btn btn-outline">
              <CalendarIcon /> Planning
            </Link>
            <Link href="/reservations/nouvelle" className="btn btn-primary">
              <PlusIcon /> Nouvelle réservation
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Occupation ce soir"
          value={`${Math.round(occupancy * 100)} %`}
          hint={`${d.rooms.occupied} / ${d.rooms.inService} chambres · ${plural(d.rooms.free, "libre")}`}
          href="/planning"
        >
          <Meter value={occupancy} label="Taux d'occupation ce soir" />
        </StatCard>
        <StatCard
          label="Arrivées du jour"
          value={d.arrivals.length}
          hint={late ? `dont ${late} en retard` : "Clients attendus aujourd'hui"}
        />
        <StatCard
          label="Départs du jour"
          value={d.departures.length}
          hint={unpaid ? `${unpaid} avec un solde à régler` : "Toutes les notes sont soldées"}
        />
        <StatCard
          label="Encaissé aujourd'hui"
          value={formatMoney(d.cash.today, cur)}
          hint={`${plural(d.cash.todayCount, "reçu")} · ${formatMoney(d.cash.month, cur)} ce mois-ci`}
          href="/recus?periode=jour"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:border-gold-400"
          >
            <span className="text-muted">{s.label}</span>
            <span className="font-semibold">{s.value}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <CardHeader
            title="Arrivées du jour"
            description={`Check-in à partir de ${hotel.checkInTime}`}
            action={
              <Link href="/reservations?vue=a-venir" className="accent text-sm font-medium hover:underline">
                Toutes
              </Link>
            }
          />
          {d.arrivals.length === 0 ? (
            <EmptyState title="Aucune arrivée attendue aujourd'hui." />
          ) : (
            <ul className="divide-y">
              {d.arrivals.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <Link href={`/reservations/${r.id}`} className="group min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold group-hover:underline">
                      {r.guest.vip && <StarIcon className="accent size-3.5" />}
                      {guestName(r.guest)}
                      {r.late && <Badge label="En retard" className={LATE} />}
                    </p>
                    <p className="text-xs text-muted">
                      {r.number} · Ch. {roomNumbers(r.rooms)} · {plural(persons(r.rooms), "personne")} ·{" "}
                      {stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime)} · arrivée prévue {r.checkInTime}
                    </p>
                  </Link>
                  <ActionForm action={checkInAction}>
                    <input type="hidden" name="reservationId" value={r.id} />
                    <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Check-in…">
                      <LoginIcon /> Check-in
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <CardHeader
            title="Départs du jour"
            description={`Check-out avant ${hotel.checkOutTime}`}
            action={
              <Link href="/reservations?vue=en-sejour" className="accent text-sm font-medium hover:underline">
                En séjour
              </Link>
            }
          />
          {d.departures.length === 0 ? (
            <EmptyState title="Aucun départ prévu aujourd'hui." />
          ) : (
            <ul className="divide-y">
              {d.departures.map(({ reservation: r, balance, late: overdue }) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <Link href={`/reservations/${r.id}`} className="group min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold group-hover:underline">
                      {r.guest.vip && <StarIcon className="accent size-3.5" />}
                      {guestName(r.guest)}
                      {overdue && <Badge label="Départ dépassé" className={LATE} />}
                    </p>
                    <p className="text-xs text-muted">
                      {r.number} · Ch. {roomNumbers(r.rooms)} · départ prévu {r.checkOutTime} ·{" "}
                      {balance > 0 ? (
                        <span className="font-semibold text-rose-700 dark:text-rose-300">
                          reste {formatMoney(balance, r.currency)}
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">note soldée</span>
                      )}
                    </p>
                  </Link>
                  {balance > 0 ? (
                    <Link href={`/reservations/${r.id}#reglement`} className="btn btn-outline btn-sm">
                      Encaisser le solde
                    </Link>
                  ) : (
                    <ActionForm action={checkOutAction}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Départ…">
                        <LogoutIcon /> Check-out
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-6">
        <CardHeader
          title="Prochaines arrivées"
          description="Sept prochains jours"
          action={
            <Link href="/planning" className="accent inline-flex items-center gap-1 text-sm font-medium hover:underline">
              Planning <ArrowRightIcon className="size-3.5" />
            </Link>
          }
        />
        {d.upcoming.length === 0 ? (
          <EmptyState title="Aucune arrivée prévue cette semaine." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Arrivée</th>
                  <th>Client</th>
                  <th>Chambres</th>
                  <th>Séjour</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {d.upcoming.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-medium">{formatDayMonth(r.checkIn)}</td>
                    <td>
                      <Link href={`/reservations/${r.id}`} className="font-semibold hover:underline">
                        {guestName(r.guest)}
                      </Link>
                      <p className="font-mono text-xs text-muted">{r.number}</p>
                    </td>
                    <td className="tabular">{roomNumbers(r.rooms)}</td>
                    <td className="whitespace-nowrap">{stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime)}</td>
                    <td>
                      <ReservationBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
