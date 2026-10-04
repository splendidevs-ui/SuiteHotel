import "server-only";
import type { Prisma } from "@prisma/client";
import {
  ACTIVE_RESERVATION_STATUSES,
  PAYMENT_METHODS,
  QUOTE_FILTERS,
  isPaymentMethod,
  type RoomState,
} from "./constants";
import { stayOn, stayWithin } from "./availability";
import { db } from "./db";
import { computeFolio, folioInclude } from "./folio";
import { addDays, addDaysToDateInput, toDateInput, todayDate, todayDateInput, zonedMidnight } from "./format";

/** Lectures des pages : tableau de bord, planning, listes et fiches. */

export const PAGE_SIZE = 25;

function pageOf(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

function pages(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

const withRooms = {
  guest: true,
  rooms: { include: { room: { include: { roomType: true } } }, orderBy: { room: { number: "asc" } } },
} satisfies Prisma.ReservationInclude;

// ----- Tableau de bord -----

export async function getDashboard() {
  const today = todayDate();
  const todayInput = todayDateInput();
  const dayStart = zonedMidnight(todayInput);
  const monthStart = zonedMidnight(`${todayInput.slice(0, 7)}-01`);

  const [rooms, tonight, arrivals, departures, inHouse, cashToday, cashMonth, pendingQuotes, openOrders, upcoming] =
    await Promise.all([
      db.room.findMany({ select: { id: true, outOfService: true } }),
      db.reservationRoom.findMany({
        where: {
          reservation: { status: { in: ACTIVE_RESERVATION_STATUSES }, ...stayOn(today) },
        },
        select: { roomId: true },
      }),
      // Arrivees du jour, et arrivees en retard (client attendu, pas encore arrive).
      db.reservation.findMany({
        where: { status: "CONFIRMEE", ...stayOn(today) },
        include: withRooms,
        orderBy: [{ checkIn: "asc" }, { createdAt: "asc" }],
      }),
      db.reservation.findMany({
        where: { status: "EN_SEJOUR", checkOut: { lte: today } },
        include: folioInclude,
        orderBy: { checkOut: "asc" },
      }),
      db.reservation.findMany({ where: { status: "EN_SEJOUR" }, select: { rooms: { select: { adults: true, children: true } } } }),
      db.receipt.aggregate({ where: { cancelledAt: null, paidAt: { gte: dayStart } }, _sum: { amount: true }, _count: true }),
      db.receipt.aggregate({ where: { cancelledAt: null, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      db.quote.count({ where: { status: "ENVOYE", validUntil: { gte: today }, reservation: { is: null } } }),
      db.restaurantOrder.count({ where: { status: "OUVERTE" } }),
      db.reservation.findMany({
        where: { status: "CONFIRMEE", checkIn: { gt: today, lt: addDays(today, 8) } },
        include: withRooms,
        orderBy: { checkIn: "asc" },
        take: 8,
      }),
    ]);

  const inService = rooms.filter((r) => !r.outOfService).length;
  const occupied = new Set(tonight.map((t) => t.roomId)).size;
  return {
    rooms: {
      total: rooms.length,
      inService,
      outOfService: rooms.length - inService,
      occupied,
      free: Math.max(0, inService - occupied),
    },
    arrivals: arrivals.map((r) => ({ ...r, late: r.checkIn < today })),
    departures: departures.map((r) => ({ reservation: r, balance: computeFolio(r).balance, late: r.checkOut < today })),
    inHouse: {
      stays: inHouse.length,
      guests: inHouse.reduce((sum, r) => sum + r.rooms.reduce((s, x) => s + x.adults + x.children, 0), 0),
    },
    cash: { today: cashToday._sum.amount ?? 0, todayCount: cashToday._count, month: cashMonth._sum.amount ?? 0 },
    pendingQuotes,
    openOrders,
    upcoming,
  };
}

// ----- Planning -----

export async function getPlanning(start: Date, days: number) {
  const end = addDays(start, days);
  const [rooms, stays] = await Promise.all([
    db.room.findMany({ include: { roomType: true }, orderBy: [{ floor: "asc" }, { number: "asc" }] }),
    db.reservationRoom.findMany({
      where: {
        reservation: {
          status: { in: ["CONFIRMEE", "EN_SEJOUR", "TERMINEE"] },
          ...stayWithin(start, end),
        },
      },
      include: {
        reservation: {
          select: {
            id: true,
            number: true,
            status: true,
            checkIn: true,
            checkOut: true,
            checkedOutAt: true,
            guest: { select: { firstName: true, lastName: true, vip: true } },
          },
        },
      },
    }),
  ]);
  return { rooms, stays };
}

// ----- Reservations -----

export const RESERVATION_VIEWS = [
  { key: "a-venir", label: "À venir", status: "CONFIRMEE" },
  { key: "en-sejour", label: "En séjour", status: "EN_SEJOUR" },
  { key: "terminees", label: "Terminées", status: "TERMINEE" },
  { key: "annulees", label: "Annulées", status: "ANNULEE" },
  { key: "toutes", label: "Toutes", status: null },
] as const;

export async function listReservations(params: { vue?: string; q?: string; page?: string }) {
  const view = RESERVATION_VIEWS.find((v) => v.key === params.vue) ?? RESERVATION_VIEWS[0];
  const q = params.q?.trim() ?? "";
  const where: Prisma.ReservationWhereInput = {
    ...(view.status ? { status: view.status } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { guest: { lastName: { contains: q } } },
            { guest: { firstName: { contains: q } } },
            { guest: { phone: { contains: q } } },
            { guest: { company: { contains: q } } },
            { rooms: { some: { room: { number: q } } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.ReservationOrderByWithRelationInput =
    view.key === "a-venir" ? { checkIn: "asc" } : view.key === "en-sejour" ? { checkOut: "asc" } : { checkIn: "desc" };
  const page = pageOf(params.page);

  const [total, items, counts] = await Promise.all([
    db.reservation.count({ where }),
    db.reservation.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: withRooms }),
    db.reservation.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countByStatus: Record<string, number> = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return { view, q, items, total, page, pages: pages(total), countByStatus };
}

export async function getReservationFormData(excludeReservationId?: string) {
  const since = addDays(todayDate(), -1);
  const [rooms, types, stays, guests] = await Promise.all([
    db.room.findMany({
      where: { roomType: { active: true } },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
      select: { id: true, number: true, floor: true, roomTypeId: true, outOfService: true, notes: true },
    }),
    db.roomType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, capacity: true, basePrice: true, bed: true, size: true },
    }),
    db.reservationRoom.findMany({
      where: { reservation: { status: { in: ACTIVE_RESERVATION_STATUSES }, checkOut: { gte: since } } },
      select: { roomId: true, reservationId: true, reservation: { select: { number: true, checkIn: true, checkOut: true } } },
    }),
    db.guest.findMany({
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, company: true, vip: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return {
    rooms,
    types,
    bookings: stays
      .filter((s) => s.reservationId !== excludeReservationId)
      .map((s) => ({
        roomId: s.roomId,
        number: s.reservation.number,
        checkIn: toDateInput(s.reservation.checkIn),
        checkOut: toDateInput(s.reservation.checkOut),
      })),
    guests,
  };
}

export type ReservationFormData = Awaited<ReturnType<typeof getReservationFormData>>;
export type GuestOption = ReservationFormData["guests"][number];
export type RoomOption = ReservationFormData["rooms"][number];
export type RoomTypeOption = ReservationFormData["types"][number];
export type BookingOption = ReservationFormData["bookings"][number];

// ----- Devis -----

export async function listQuotes(params: { statut?: string; q?: string; page?: string }) {
  const today = todayDate();
  const status = QUOTE_FILTERS.find((s) => s === params.statut) ?? null;
  const q = params.q?.trim() ?? "";
  const statusWhere: Prisma.QuoteWhereInput =
    status === "EXPIRE"
      ? { status: "ENVOYE", validUntil: { lt: today } }
      : status === "ENVOYE"
        ? { status: "ENVOYE", validUntil: { gte: today } }
        : status
          ? { status }
          : {};
  const where: Prisma.QuoteWhereInput = {
    ...statusWhere,
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { guest: { lastName: { contains: q } } },
            { guest: { firstName: { contains: q } } },
            { guest: { company: { contains: q } } },
          ],
        }
      : {}),
  };
  const page = pageOf(params.page);
  const [total, items] = await Promise.all([
    db.quote.count({ where }),
    db.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        guest: true,
        reservation: { select: { id: true, number: true } },
        rooms: { select: { quantity: true } },
      },
    }),
  ]);
  return { status, q, items, total, page, pages: pages(total), today };
}

export async function getQuote(id: string) {
  return db.quote.findUnique({
    where: { id },
    include: {
      guest: true,
      createdBy: { select: { name: true, jobTitle: true } },
      rooms: { include: { roomType: true }, orderBy: { position: "asc" } },
      extras: { orderBy: { position: "asc" } },
      reservation: { select: { id: true, number: true } },
    },
  });
}

export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

// ----- Recus -----

export const RECEIPT_PERIODS = [
  { key: "jour", label: "Aujourd'hui" },
  { key: "semaine", label: "7 derniers jours" },
  { key: "mois", label: "Ce mois-ci" },
  { key: "tout", label: "Tout" },
] as const;

export async function listReceipts(params: { periode?: string; mode?: string; q?: string; page?: string }) {
  const period = RECEIPT_PERIODS.find((p) => p.key === params.periode) ?? RECEIPT_PERIODS[2];
  const todayInput = todayDateInput();
  const since =
    period.key === "jour"
      ? zonedMidnight(todayInput)
      : period.key === "semaine"
        ? zonedMidnight(addDaysToDateInput(todayInput, -6))
        : period.key === "mois"
          ? zonedMidnight(`${todayInput.slice(0, 7)}-01`)
          : null;
  const method = params.mode && isPaymentMethod(params.mode) ? params.mode : null;
  const q = params.q?.trim() ?? "";
  const where: Prisma.ReceiptWhereInput = {
    ...(since ? { paidAt: { gte: since } } : {}),
    ...(method ? { method } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { payerName: { contains: q } },
            { label: { contains: q } },
            { reference: { contains: q } },
          ],
        }
      : {}),
  };
  const page = pageOf(params.page);
  const [total, items, byMethod, cancelled] = await Promise.all([
    db.receipt.count({ where }),
    db.receipt.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        createdBy: { select: { name: true } },
        reservation: { select: { id: true, number: true } },
        order: { select: { id: true, number: true } },
      },
    }),
    db.receipt.groupBy({
      by: ["method"],
      where: { ...where, cancelledAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.receipt.count({ where: { ...where, cancelledAt: { not: null } } }),
  ]);
  const totals = PAYMENT_METHODS.map((m) => {
    const row = byMethod.find((b) => b.method === m);
    return { method: m, amount: row?._sum.amount ?? 0, count: row?._count._all ?? 0 };
  });
  return {
    period,
    method,
    q,
    items,
    total,
    page,
    pages: pages(total),
    totals,
    sum: totals.reduce((s, t) => s + t.amount, 0),
    cancelled,
  };
}

export async function getReceipt(id: string) {
  return db.receipt.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      reservation: { include: withRooms },
      order: { select: { id: true, number: true, tableLabel: true } },
    },
  });
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceipt>>>;

// ----- Clients -----

export async function listGuests(params: { q?: string; page?: string }) {
  const q = params.q?.trim() ?? "";
  const where: Prisma.GuestWhereInput = q
    ? {
        OR: [
          { lastName: { contains: q } },
          { firstName: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { company: { contains: q } },
        ],
      }
    : {};
  const page = pageOf(params.page);
  const [total, items] = await Promise.all([
    db.guest.count({ where }),
    db.guest.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { reservations: true, quotes: true } },
        reservations: {
          orderBy: { checkIn: "desc" },
          take: 1,
          select: { id: true, number: true, checkIn: true, checkOut: true, status: true },
        },
      },
    }),
  ]);
  return { q, items, total, page, pages: pages(total) };
}

export async function getGuest(id: string) {
  return db.guest.findUnique({
    where: { id },
    include: {
      reservations: {
        orderBy: { checkIn: "desc" },
        include: { rooms: { include: { room: true }, orderBy: { room: { number: "asc" } } } },
      },
      quotes: { orderBy: { createdAt: "desc" }, include: { reservation: { select: { id: true, number: true } } } },
    },
  });
}

/** Total encaisse aupres d'un client (recus de ses sejours, hors annules). */
export async function guestSpending(guestId: string) {
  const sum = await db.receipt.aggregate({
    where: { cancelledAt: null, reservation: { guestId } },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

// ----- Chambres -----

export async function getRoomsBoard() {
  const today = todayDate();
  const [types, rooms, current] = await Promise.all([
    db.roomType.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { rooms: true } } } }),
    db.room.findMany({
      include: { roomType: true, _count: { select: { stays: true } } },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    }),
    db.reservationRoom.findMany({
      where: {
        reservation: {
          OR: [{ status: "EN_SEJOUR" }, { status: "CONFIRMEE", ...stayOn(today) }],
        },
      },
      include: { reservation: { include: { guest: true } } },
    }),
  ]);

  // Une chambre occupee l'emporte sur une arrivee attendue (client precedent pas encore parti).
  const byRoom = new Map<string, (typeof current)[number]>();
  for (const stay of current) {
    const previous = byRoom.get(stay.roomId);
    if (!previous || stay.reservation.status === "EN_SEJOUR") byRoom.set(stay.roomId, stay);
  }

  return {
    types,
    rooms: rooms.map((room) => {
      const stay = byRoom.get(room.id);
      let state: RoomState = "LIBRE";
      if (room.outOfService) state = "HS";
      else if (stay?.reservation.status === "EN_SEJOUR") state = stay.reservation.checkOut <= today ? "DEPART" : "OCCUPEE";
      else if (stay) state = "ARRIVEE";
      return { ...room, state, reservation: stay?.reservation ?? null };
    }),
  };
}

// ----- Restaurant -----

export async function getInHouse() {
  return db.reservation.findMany({
    where: { status: "EN_SEJOUR" },
    include: { guest: true, rooms: { include: { room: true }, orderBy: { room: { number: "asc" } } } },
    orderBy: { checkIn: "asc" },
  });
}

export type InHouseReservation = Awaited<ReturnType<typeof getInHouse>>[number];

export async function getRestaurantBoard() {
  const dayStart = zonedMidnight(todayDateInput());
  const [open, closedToday, inHouse] = await Promise.all([
    db.restaurantOrder.findMany({
      where: { status: "OUVERTE" },
      orderBy: { createdAt: "asc" },
      include: {
        lines: { select: { quantity: true } },
        reservation: { include: { guest: true, rooms: { include: { room: true } } } },
      },
    }),
    db.restaurantOrder.findMany({
      where: { status: { not: "OUVERTE" }, closedAt: { gte: dayStart } },
      orderBy: { closedAt: "desc" },
      include: { reservation: { include: { guest: true } } },
    }),
    getInHouse(),
  ]);
  return { open, closedToday, inHouse };
}

export async function getOrder(id: string) {
  return db.restaurantOrder.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { id: "asc" } },
      createdBy: { select: { name: true } },
      receipts: { orderBy: { paidAt: "desc" } },
      reservation: { include: { guest: true, rooms: { include: { room: true } } } },
    },
  });
}

export async function getMenu() {
  return db.menuItem.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

// ----- Personnel -----

export async function listStaff() {
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, jobTitle: true, active: true, lastLoginAt: true, createdAt: true },
  });
}

// ----- Fiche reservation -----

export async function getReservationForEdit(id: string) {
  return db.reservation.findUnique({ where: { id }, include: { rooms: { orderBy: { room: { number: "asc" } } } } });
}

/** Additions du restaurant encore ouvertes pour un client en sejour. */
export async function getOpenOrdersFor(reservationId: string) {
  return db.restaurantOrder.findMany({
    where: { reservationId, status: "OUVERTE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, tableLabel: true, total: true, createdAt: true },
  });
}
