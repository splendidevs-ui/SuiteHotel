import "server-only";
import type { Prisma } from "@prisma/client";
import { ACTIVE_RESERVATION_STATUSES } from "./constants";
import { db } from "./db";
import { addDays } from "./format";

/**
 * Sejours qui touchent la periode [debut, fin[. Un sejour occupe les jours [arrivee, depart[ :
 * le jour du depart d'un client, sa chambre peut accueillir une nouvelle arrivee.
 * Un sejour de jour (depart le jour de l'arrivee) occupe sa journee entiere.
 */
export function stayWithin(start: Date, end: Date): Prisma.ReservationWhereInput {
  return {
    checkIn: { lt: end },
    OR: [{ checkOut: { gt: start } }, { checkIn: { gte: start } }],
  };
}

/** Sejours en cours le jour donne (client attendu ou present). */
export function stayOn(day: Date): Prisma.ReservationWhereInput {
  return stayWithin(day, addDays(day, 1));
}

/**
 * Disponibilite des chambres. Seules les reservations confirmees ou en cours bloquent une chambre.
 */
function overlapping(checkIn: Date, checkOut: Date, excludeReservationId?: string): Prisma.ReservationWhereInput {
  const end = checkOut > checkIn ? checkOut : addDays(checkIn, 1);
  return {
    status: { in: ACTIVE_RESERVATION_STATUSES },
    ...stayWithin(checkIn, end),
    ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
  };
}

/** Sejours qui occupent deja l'une des chambres sur la periode. */
export async function findConflicts(
  client: Prisma.TransactionClient,
  roomIds: string[],
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string,
) {
  if (roomIds.length === 0) return [];
  return client.reservationRoom.findMany({
    where: { roomId: { in: roomIds }, reservation: overlapping(checkIn, checkOut, excludeReservationId) },
    select: {
      room: { select: { number: true } },
      reservation: { select: { number: true, checkIn: true, checkOut: true } },
    },
    orderBy: { room: { number: "asc" } },
  });
}

/** Chambres en service, d'une categorie commercialisee, libres sur toute la periode. */
export async function availableRooms(
  checkIn: Date,
  checkOut: Date,
  client: Prisma.TransactionClient = db,
  excludeReservationId?: string,
) {
  const rooms = await client.room.findMany({
    where: { outOfService: false, roomType: { active: true } },
    include: { roomType: true },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });
  const busy = await client.reservationRoom.findMany({
    where: { reservation: overlapping(checkIn, checkOut, excludeReservationId) },
    select: { roomId: true },
  });
  const busyIds = new Set(busy.map((b) => b.roomId));
  return rooms.filter((r) => !busyIds.has(r.id));
}
