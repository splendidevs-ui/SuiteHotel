import { DAY_MS, addDaysToDateInput, parseDateInput } from "./format";

/**
 * Calculs d'un sejour, partages par les formulaires (apercu en direct), le serveur
 * (devis, note de sejour) et les PDF. Montants en unite stockee (voir money.ts) :
 * ce sont des entiers, sans derive d'arrondi.
 *
 *   Hebergement  = nuits x tarif, pour chaque chambre (heures x tarif horaire pour un sejour a l'heure)
 *   Formule      = personnes x nuits x prix de la formule
 *   Total HT     = hebergement + formule + prestations + restaurant
 *   TVA          = Total HT x taux
 *   Taxe sejour  = chambres x nuits x taxe (hors TVA)
 *   Total TTC    = Total HT + TVA + taxe de sejour
 */

/** Ecart en jours calendaires entre deux dates (AAAA-MM-JJ ou Date a minuit UTC) ; negatif si inverse. */
export function daysBetween(checkIn: Date | string, checkOut: Date | string) {
  const a = typeof checkIn === "string" ? parseDateInput(checkIn) : checkIn;
  const b = typeof checkOut === "string" ? parseDateInput(checkOut) : checkOut;
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Nuits facturees entre deux dates. Un sejour de jour (depart le jour de l'arrivee)
 * est facture comme une nuit.
 */
export function nightsBetween(checkIn: Date | string, checkOut: Date | string) {
  const days = daysBetween(checkIn, checkOut);
  if (!(days >= 0)) return 0;
  return Math.max(1, days);
}

/** Depart le jour meme de l'arrivee. */
export function isDayUse(checkIn: Date | string, checkOut: Date | string) {
  return daysBetween(checkIn, checkOut) === 0;
}

function minutesOf(time: string | undefined) {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/**
 * Heures facturees d'un sejour a l'heure (depart le jour de l'arrivee, donc moins de 24 h) :
 * chaque heure entamee compte, une heure au minimum. null pour un sejour a la nuit.
 */
export function stayHours(
  checkIn: Date | string,
  checkOut: Date | string,
  checkInTime?: string,
  checkOutTime?: string,
): number | null {
  if (!isDayUse(checkIn, checkOut)) return null;
  const minutes = minutesOf(checkOutTime) - minutesOf(checkInTime);
  if (!Number.isFinite(minutes)) return null;
  return Math.max(1, Math.ceil(minutes / 60));
}

/** Duree lisible : « 3 nuits », « 4 h » pour un sejour a l'heure, ou « Journée » sans les heures. */
export function stayLength(checkIn: Date | string, checkOut: Date | string, checkInTime?: string, checkOutTime?: string) {
  const hours = stayHours(checkIn, checkOut, checkInTime, checkOutTime);
  if (hours !== null) return `${hours} h`;
  if (isDayUse(checkIn, checkOut)) return "Journée";
  const n = nightsBetween(checkIn, checkOut);
  return `${n} ${n > 1 ? "nuits" : "nuit"}`;
}

/** Heure de depart d'un sejour a l'heure : `hours` apres l'arrivee, sans depasser minuit. */
export function addHoursToTime(time: string, hours: number) {
  const start = minutesOf(time);
  if (!Number.isFinite(start)) return time;
  const end = Math.min(23 * 60 + 59, start + hours * 60);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/**
 * Chevauchement de deux sejours (dates AAAA-MM-JJ). Un sejour occupe les jours
 * [arrivee, depart[ ; un sejour de jour occupe sa journee entiere.
 */
export function staysOverlap(a: { checkIn: string; checkOut: string }, b: { checkIn: string; checkOut: string }) {
  const end = (s: { checkIn: string; checkOut: string }) =>
    s.checkOut > s.checkIn ? s.checkOut : addDaysToDateInput(s.checkIn, 1);
  return a.checkIn < end(b) && end(a) > b.checkIn;
}

export interface RoomLineAmounts {
  /** Nombre de chambres identiques (devis) ; 1 pour une chambre attribuee. */
  quantity?: number;
  /** Occupants par chambre. */
  adults: number;
  children: number;
  nightlyRate: number;
}

export interface StayAmounts {
  nights: number;
  /** Sejour a l'heure : l'hebergement se compte en heures ; formule et taxe de sejour restent a la nuit. */
  hours?: number | null;
  rooms: RoomLineAmounts[];
  mealPlanPrice: number;
  extras?: number;
  restaurant?: number;
  vatRate: number;
  cityTax: number;
}

export function lineAmount(quantity: number, unitPrice: number) {
  return Math.round(quantity * unitPrice);
}

export function stayTotals(stay: StayAmounts) {
  const nights = Math.max(0, stay.nights);
  let roomCount = 0;
  let persons = 0;
  let accommodation = 0;
  for (const room of stay.rooms) {
    const quantity = room.quantity ?? 1;
    roomCount += quantity;
    persons += quantity * (room.adults + room.children);
    accommodation += quantity * (stay.hours ?? nights) * room.nightlyRate;
  }
  const meals = persons * nights * stay.mealPlanPrice;
  const extras = stay.extras ?? 0;
  const restaurant = stay.restaurant ?? 0;
  const subtotal = accommodation + meals + extras + restaurant;
  const vatAmount = Math.round((subtotal * stay.vatRate) / 100);
  const cityTaxAmount = stay.cityTax * roomCount * nights;
  return {
    nights,
    hours: stay.hours ?? null,
    roomCount,
    persons,
    accommodation,
    meals,
    extras,
    restaurant,
    /** Total HT */
    subtotal,
    vatAmount,
    cityTaxAmount,
    /** Total TTC */
    total: subtotal + vatAmount + cityTaxAmount,
  };
}

export type StayTotals = ReturnType<typeof stayTotals>;

/** Addition du restaurant : prix de la carte HT, TVA ajoutee. */
export function orderTotals(lines: { quantity: number; unitPrice: number }[], vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l.quantity, l.unitPrice), 0);
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
