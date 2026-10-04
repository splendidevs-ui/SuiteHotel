import "server-only";
import type { SessionUser } from "./auth";
import { db } from "./db";
import { DIRECTION_ONLY, fail, type ActionResult } from "./errors";
import { getHotel } from "./hotel";
import { toStoredAmount } from "./money";
import { toNumber } from "./schemas";

/** Categories et chambres : la direction les gere ; la reception signale les chambres hors service. */

export interface RoomTypeFields {
  name: string;
  description: string;
  capacity: string;
  basePrice: string;
  size: string;
  bed: string;
  amenities: string;
}

export async function saveRoomType(actor: SessionUser, typeId: string | null, f: RoomTypeFields): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const name = f.name.trim();
  if (name.length < 2 || name.length > 80) return fail("Indiquez le nom de la catégorie.");
  const capacity = Number(f.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) return fail("Capacité invalide (1 à 12 personnes).");
  const price = Number(toNumber(f.basePrice));
  if (!Number.isFinite(price) || price < 0) return fail("Tarif par nuit invalide.");
  const size = f.size.trim() ? Number(f.size) : null;
  if (size !== null && (!Number.isInteger(size) || size <= 0 || size > 5000)) return fail("Surface invalide.");

  const clash = await db.roomType.findFirst({ where: { name, ...(typeId ? { id: { not: typeId } } : {}) } });
  if (clash) return fail("Une catégorie porte déjà ce nom.");

  const hotel = await getHotel();
  const data = {
    name,
    description: f.description.trim().slice(0, 1000) || null,
    capacity,
    basePrice: toStoredAmount(price, hotel.currency),
    size,
    bed: f.bed.trim().slice(0, 80) || null,
    amenities: f.amenities.trim().slice(0, 1000) || null,
  };
  if (typeId) {
    const updated = await db.roomType.updateMany({ where: { id: typeId }, data });
    if (updated.count === 0) return fail("Cette catégorie n'existe plus.");
    return { ok: true, id: typeId };
  }
  const sortOrder = await db.roomType.count();
  const created = await db.roomType.create({ data: { ...data, sortOrder } });
  return { ok: true, id: created.id };
}

export async function saveRoom(
  actor: SessionUser,
  roomId: string | null,
  f: { number: string; floor: string; roomTypeId: string },
): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const number = f.number.trim();
  if (!number || number.length > 10) return fail("Numéro de chambre invalide.");
  const floor = Number(f.floor || 0);
  if (!Number.isInteger(floor) || floor < -3 || floor > 99) return fail("Étage invalide.");
  const type = await db.roomType.findUnique({ where: { id: f.roomTypeId } });
  if (!type) return fail("Choisissez une catégorie.");
  const clash = await db.room.findFirst({ where: { number, ...(roomId ? { id: { not: roomId } } : {}) } });
  if (clash) return fail(`La chambre ${number} existe déjà.`);

  const data = { number, floor, roomTypeId: type.id };
  if (roomId) {
    const updated = await db.room.updateMany({ where: { id: roomId }, data });
    if (updated.count === 0) return fail("Cette chambre n'existe plus.");
    return { ok: true, id: roomId };
  }
  const created = await db.room.create({ data });
  return { ok: true, id: created.id };
}

/** Mise hors service (travaux, panne) ou remise en service. Une chambre occupee reste en service. */
export async function setOutOfService(
  actor: SessionUser,
  roomId: string,
  outOfService: boolean,
  notes: string,
): Promise<ActionResult> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return fail("Cette chambre n'existe plus.");
  if (outOfService) {
    const occupied = await db.reservationRoom.findFirst({
      where: { roomId, reservation: { status: "EN_SEJOUR" } },
      include: { reservation: { select: { number: true } } },
    });
    if (occupied) {
      return fail(`La chambre ${room.number} est occupée (${occupied.reservation.number}) : validez d'abord le départ du client.`);
    }
  }
  await db.room.update({
    where: { id: roomId },
    data: { outOfService, notes: outOfService ? notes.trim().slice(0, 200) || null : null },
  });
  return { ok: true, id: roomId };
}

export async function deleteRoom(actor: SessionUser, roomId: string): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const stays = await db.reservationRoom.count({ where: { roomId } });
  if (stays > 0) return fail("Cette chambre a un historique de séjours : mettez-la hors service plutôt que de la supprimer.");
  const deleted = await db.room.deleteMany({ where: { id: roomId } });
  if (deleted.count === 0) return fail("Cette chambre n'existe plus.");
  return { ok: true, id: roomId };
}
