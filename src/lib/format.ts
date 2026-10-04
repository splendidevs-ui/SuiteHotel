/** Fuseau de l'hotel, pour "aujourd'hui" et l'heure des encaissements. */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Africa/Abidjan";

export const DAY_MS = 86_400_000;

/**
 * Dates calendaires (arrivee, depart, emission, validite) : stockees a minuit UTC
 * et affichees en UTC, pour qu'un 14 septembre reste un 14 septembre quel que soit le fuseau.
 */
export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  }).format(new Date(date));
}

export function formatShortDate(date: Date | string) {
  return formatDate(date, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "lun. 14 sept." */
export function formatDayMonth(date: Date | string) {
  return formatDate(date, { weekday: "short", day: "numeric", month: "short", year: undefined });
}

/** Periode de sejour : "12 – 15 sept. 2026". */
export function formatDateRange(start: Date | string, end: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(start), new Date(end));
}

/** Horodatage d'un encaissement : "14 sept. 2026, 21:05". */
export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(date));
}

export function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(
    new Date(date),
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function guestName(guest: { firstName: string; lastName: string }) {
  return `${guest.firstName} ${guest.lastName}`.trim();
}

/** "2 adultes + 1 enfant" */
export function occupants(adults: number, children: number) {
  const grown = plural(adults, "adulte");
  return children > 0 ? `${grown} + ${plural(children, "enfant")}` : grown;
}

// ----- Champs <input type="date"> (AAAA-MM-JJ) -----

/** Date du jour dans le fuseau de l'hotel, au format AAAA-MM-JJ. */
export function todayDateInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Date du jour (fuseau de l'hotel) a minuit UTC, comparable aux dates de sejour. */
export function todayDate() {
  return parseDateInput(todayDateInput())!;
}

/** Date calendaire (fuseau de l'hotel) d'un instant, a minuit UTC. */
export function calendarDateOf(at: Date) {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return parseDateInput(value)!;
}

export function toDateInput(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

/** "2026-09-14" -> Date a minuit UTC ; null si la date n'existe pas (31 fevrier…). */
export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toDateInput(date) !== value ? null : date;
}

export function addDaysToDateInput(value: string, days: number) {
  const date = parseDateInput(value) ?? new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInput(date);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Decalage du fuseau de l'hotel par rapport a UTC, a un instant donne. */
function zoneOffsetMs(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** Instant de minuit, heure de l'hotel, pour une date AAAA-MM-JJ (bornes des encaissements du jour). */
export function zonedMidnight(value: string) {
  const utcMidnight = parseDateInput(value) ?? todayDate();
  return new Date(utcMidnight.getTime() - zoneOffsetMs(utcMidnight));
}
