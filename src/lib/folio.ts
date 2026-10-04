import "server-only";
import type { Prisma } from "@prisma/client";
import { MEAL_PLAN_META, isMealPlan } from "./constants";
import { db } from "./db";
import { formatDate, formatDateRange, formatDateTime, occupants, plural } from "./format";
import { nightsBetween, stayHours, stayLength, stayTotals } from "./stay-math";

/**
 * Lignes des documents (devis, note de sejour) et note de sejour d'une reservation,
 * calculee a la lecture : hebergement, formule, prestations, additions du restaurant
 * portees sur la chambre, reglements et solde. Rien n'est stocke : la note reflete
 * toujours les lignes actuelles.
 */

export interface DocumentLine {
  designation: string;
  detail?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
}

function mealLine(plan: string, persons: number, nights: number, price: number): DocumentLine {
  const label = isMealPlan(plan) ? MEAL_PLAN_META[plan].label : plan;
  return {
    designation: `Formule ${label.toLowerCase()}`,
    detail: `${plural(persons, "personne")} × ${plural(nights, "nuit")}`,
    quantity: persons * nights,
    unit: "pers./nuit",
    unitPrice: price,
    total: persons * nights * price,
  };
}

type QuoteForLines = {
  checkIn: Date;
  checkOut: Date;
  mealPlan: string;
  mealPlanPrice: number;
  rooms: { quantity: number; adults: number; children: number; nightlyRate: number; roomType: { name: string } }[];
  extras: { designation: string; quantity: number; unitPrice: number; total: number }[];
};

/** Lignes d'un devis : une par categorie de chambre, la formule, puis les prestations. */
export function quoteLines(q: QuoteForLines): DocumentLine[] {
  const nights = nightsBetween(q.checkIn, q.checkOut);
  const period = formatDateRange(q.checkIn, q.checkOut);
  const lines: DocumentLine[] = q.rooms.map((r) => ({
    designation: r.quantity > 1 ? `${r.quantity} chambres « ${r.roomType.name} »` : r.roomType.name,
    detail: `${occupants(r.adults, r.children)}${r.quantity > 1 ? " par chambre" : ""} · ${period}`,
    quantity: r.quantity * nights,
    unit: r.quantity > 1 ? "nuitées" : nights > 1 ? "nuits" : "nuit",
    unitPrice: r.nightlyRate,
    total: r.quantity * nights * r.nightlyRate,
  }));
  const persons = q.rooms.reduce((sum, r) => sum + r.quantity * (r.adults + r.children), 0);
  if (persons * nights * q.mealPlanPrice > 0) lines.push(mealLine(q.mealPlan, persons, nights, q.mealPlanPrice));
  for (const e of q.extras) {
    lines.push({ designation: e.designation, quantity: e.quantity, unitPrice: e.unitPrice, total: e.total });
  }
  return lines;
}

export const folioInclude = {
  guest: true,
  createdBy: { select: { id: true, name: true } },
  quote: { select: { id: true, number: true } },
  rooms: {
    include: { room: { include: { roomType: true } } },
    orderBy: { room: { number: "asc" } },
  },
  charges: {
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  },
  orders: { where: { status: "IMPUTEE" }, orderBy: { createdAt: "asc" } },
  receipts: {
    include: { createdBy: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
  },
} satisfies Prisma.ReservationInclude;

export type FolioReservation = Prisma.ReservationGetPayload<{ include: typeof folioInclude }>;

export function computeFolio(r: FolioReservation) {
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const hours = stayHours(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime);
  const units = hours ?? nights;
  const extras = r.charges.reduce((sum, c) => sum + c.total, 0);
  const restaurant = r.orders.reduce((sum, o) => sum + o.subtotal, 0);
  const totals = stayTotals({
    nights,
    hours,
    rooms: r.rooms,
    mealPlanPrice: r.mealPlanPrice,
    extras,
    restaurant,
    vatRate: r.vatRate,
    cityTax: r.cityTax,
  });
  const paid = r.receipts.filter((x) => !x.cancelledAt).reduce((sum, x) => sum + x.amount, 0);

  const period = formatDateRange(r.checkIn, r.checkOut);
  const lines: DocumentLine[] = r.rooms.map((stay) => ({
    designation: `Chambre ${stay.room.number} — ${stay.room.roomType.name}`,
    detail: `${occupants(stay.adults, stay.children)} · ${period}`,
    quantity: units,
    unit: hours !== null ? (hours > 1 ? "heures" : "heure") : nights > 1 ? "nuits" : "nuit",
    unitPrice: stay.nightlyRate,
    total: units * stay.nightlyRate,
  }));
  if (totals.meals > 0) lines.push(mealLine(r.mealPlan, totals.persons, nights, r.mealPlanPrice));
  for (const c of r.charges) {
    lines.push({
      designation: c.designation,
      detail: formatDate(c.date),
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      total: c.total,
    });
  }
  for (const o of r.orders) {
    lines.push({
      designation: `Restaurant — addition ${o.number}`,
      detail: `${o.tableLabel} · ${formatDateTime(o.closedAt ?? o.createdAt)}`,
      quantity: 1,
      unitPrice: o.subtotal,
      total: o.subtotal,
    });
  }

  const length = stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime);
  return { nights, hours, units, length, totals, paid, balance: totals.total - paid, lines };
}

export async function getFolio(reservationId: string, client: Prisma.TransactionClient = db) {
  const reservation = await client.reservation.findUnique({ where: { id: reservationId }, include: folioInclude });
  if (!reservation) return null;
  return { reservation, ...computeFolio(reservation) };
}

export type Folio = NonNullable<Awaited<ReturnType<typeof getFolio>>>;
