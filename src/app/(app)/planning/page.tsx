import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, StarIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { RESERVATION_STATUS_META, isReservationStatus } from "@/lib/constants";
import {
  DAY_MS,
  addDays,
  addDaysToDateInput,
  calendarDateOf,
  formatDate,
  formatDateRange,
  guestName,
  parseDateInput,
  toDateInput,
  todayDateInput,
} from "@/lib/format";
import { getPlanning } from "@/lib/queries";

export const metadata: Metadata = { title: "Planning" };

const DAYS = 14;
const TEMPLATE = { gridTemplateColumns: `9.5rem repeat(${DAYS}, minmax(2.75rem, 1fr))` };
const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

function dayIndex(date: Date, start: Date) {
  return Math.round((date.getTime() - start.getTime()) / DAY_MS);
}

interface Bar {
  key: string;
  reservationId: string;
  status: string;
  guest: string;
  vip: boolean;
  from: number;
  to: number;
  title: string;
  clippedLeft: boolean;
  clippedRight: boolean;
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ debut?: string }> }) {
  await requireUser();
  const { debut } = await searchParams;
  const todayInput = todayDateInput();
  const startInput = debut && parseDateInput(debut) ? debut : todayInput;
  const start = parseDateInput(startInput)!;
  const { rooms, stays } = await getPlanning(start, DAYS);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const todayIdx = dayIndex(parseDateInput(todayInput)!, start);
  const inService = rooms.filter((r) => !r.outOfService).length;
  const occupiedPerDay = new Array<number>(DAYS).fill(0);

  const barsByRoom = new Map<string, Bar[]>();
  for (const stay of stays) {
    const res = stay.reservation;
    // Un depart anticipe libere la chambre : la barre s'arrete au jour du depart reel.
    // Un sejour de jour occupe sa journee.
    let end = res.checkOut > res.checkIn ? res.checkOut : addDays(res.checkIn, 1);
    if (res.status === "TERMINEE" && res.checkedOutAt) {
      const out = Math.max(addDays(res.checkIn, 1).getTime(), calendarDateOf(res.checkedOutAt).getTime());
      end = new Date(Math.min(end.getTime(), out));
    }
    const from = Math.max(0, dayIndex(res.checkIn, start));
    const to = Math.min(DAYS, dayIndex(end, start));
    if (to <= from) continue;
    for (let i = from; i < to; i++) occupiedPerDay[i]++;

    const status = isReservationStatus(res.status) ? RESERVATION_STATUS_META[res.status].label : res.status;
    const list = barsByRoom.get(stay.roomId) ?? [];
    list.push({
      key: stay.id,
      reservationId: res.id,
      status: res.status,
      guest: guestName(res.guest),
      vip: res.guest.vip,
      from,
      to,
      title: `${res.number} · ${guestName(res.guest)} · ${formatDateRange(res.checkIn, res.checkOut)} · ${status}`,
      clippedLeft: res.checkIn < start,
      clippedRight: end > addDays(start, DAYS),
    });
    barsByRoom.set(stay.roomId, list);
  }

  const months = [...new Set(days.map((d) => MONTH.format(d)))].join(" – ");

  return (
    <>
      <PageHeader
        eyebrow="Occupation des chambres"
        title="Planning"
        description={`${months} · cliquez sur une case libre pour réserver à partir de ce jour.`}
        actions={
          <>
            <Link href={`/planning?debut=${addDaysToDateInput(startInput, -7)}`} className="btn btn-outline btn-icon" aria-label="Semaine précédente">
              <ChevronLeftIcon className="size-5" />
            </Link>
            <Link href="/planning" className="btn btn-outline">
              Aujourd&apos;hui
            </Link>
            <Link href={`/planning?debut=${addDaysToDateInput(startInput, 7)}`} className="btn btn-outline btn-icon" aria-label="Semaine suivante">
              <ChevronRightIcon className="size-5" />
            </Link>
            <form action="/planning" className="flex items-center gap-2">
              <input type="date" name="debut" defaultValue={startInput} className="input w-40" aria-label="Afficher à partir du" />
              <button type="submit" className="btn btn-outline">
                Aller
              </button>
            </form>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
        {(["CONFIRMEE", "EN_SEJOUR", "TERMINEE"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span className={`inline-block h-3 w-6 rounded border ${RESERVATION_STATUS_META[s].bar}`} />
            {RESERVATION_STATUS_META[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded border bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(244_63_94/0.25)_4px_8px)]" />
          Hors service
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <div className="min-w-[56rem]">
            <div style={TEMPLATE} className="grid border-b bg-surface-alt text-xs">
              <div className="sticky left-0 z-10 bg-surface-alt px-3 py-2 font-semibold uppercase tracking-wide text-muted">
                Chambre
              </div>
              {days.map((d, i) => {
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <div
                    key={i}
                    className={`border-l px-1 py-2 text-center ${
                      i === todayIdx
                        ? "bg-gold-100 text-gold-900 dark:bg-gold-500/20 dark:text-gold-100"
                        : weekend
                          ? "bg-ink-100 dark:bg-white/[0.03]"
                          : ""
                    }`}
                  >
                    <div className="text-[0.65rem] uppercase text-muted">{WEEKDAY.format(d)}</div>
                    <div className="font-semibold">{d.getUTCDate()}</div>
                  </div>
                );
              })}
            </div>

            {rooms.map((room) => (
              <div key={room.id} style={TEMPLATE} className="grid border-b">
                <div
                  style={{ gridRow: 1, gridColumn: 1 }}
                  className="sticky left-0 z-10 flex flex-col justify-center bg-surface px-3 py-2"
                >
                  <span className="tabular text-sm font-semibold">{room.number}</span>
                  <span className={`truncate text-[0.7rem] ${room.outOfService ? "font-medium text-rose-600" : "text-muted"}`}>
                    {room.outOfService ? "Hors service" : room.roomType.name}
                  </span>
                </div>
                {days.map((d, i) => {
                  const bookable = !room.outOfService && i >= todayIdx;
                  return (
                    <div
                      key={i}
                      style={{ gridRow: 1, gridColumn: i + 2 }}
                      className={`min-h-12 border-l ${
                        room.outOfService
                          ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(244_63_94/0.08)_6px_12px)]"
                          : i === todayIdx
                            ? "bg-gold-50 dark:bg-gold-500/[0.06]"
                            : ""
                      }`}
                    >
                      {bookable && (
                        // Lien simple (sans prechargement) : il ajoute la chambre a la reservation en cours.
                        <a
                          href={`/reservations/nouvelle/preparer?chambre=${room.id}&arrivee=${toDateInput(d)}`}
                          className="grid h-full place-items-center text-muted opacity-0 transition-opacity hover:bg-gold-50 hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-gold-500/10"
                          aria-label={`Réserver la chambre ${room.number} à partir du ${formatDate(d)}`}
                        >
                          <PlusIcon className="size-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
                {(barsByRoom.get(room.id) ?? []).map((bar) => {
                  const meta = isReservationStatus(bar.status) ? RESERVATION_STATUS_META[bar.status] : RESERVATION_STATUS_META.CONFIRMEE;
                  return (
                    <Link
                      key={bar.key}
                      href={`/reservations/${bar.reservationId}`}
                      title={bar.title}
                      aria-label={bar.title}
                      style={{ gridRow: 1, gridColumn: `${bar.from + 2} / ${bar.to + 2}` }}
                      className={`relative z-[5] my-1.5 flex items-center gap-1 overflow-hidden border px-2 text-xs font-semibold shadow-sm transition-transform hover:-translate-y-px ${meta.bar} ${
                        bar.clippedLeft ? "rounded-l-none border-l-0" : "ml-1 rounded-l-md"
                      } ${bar.clippedRight ? "rounded-r-none border-r-0" : "mr-1 rounded-r-md"}`}
                    >
                      {bar.vip && <StarIcon className="size-3 shrink-0" />}
                      <span className="truncate">{bar.guest}</span>
                    </Link>
                  );
                })}
              </div>
            ))}

            <div style={TEMPLATE} className="grid bg-surface-alt text-xs">
              <div className="sticky left-0 z-10 bg-surface-alt px-3 py-2 font-semibold text-muted">Chambres occupées</div>
              {occupiedPerDay.map((count, i) => (
                <div key={i} className="tabular border-l px-1 py-2 text-center">
                  <div className="font-semibold">{count}</div>
                  <div className="text-[0.65rem] text-muted">{inService ? Math.round((count / inService) * 100) : 0} %</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
