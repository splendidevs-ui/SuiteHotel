import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import { findConflicts } from "./availability";
import { ACTIVE_RESERVATION_STATUSES, isReservationStatus, mealPlanPrice } from "./constants";
import { db } from "./db";
import { BusinessError, RESTAURANT_OFF, attempt, fail, type ActionResult } from "./errors";
import { getFolio } from "./folio";
import { formatDate, formatDateRange, guestName, parseDateInput, todayDate } from "./format";
import { resolveGuest } from "./guests";
import { getHotel } from "./hotel";
import { formatMoney, toStoredAmount } from "./money";
import { nextNumber } from "./numbering";
import { insertReceipt, paymentLabel } from "./receipts";
import { chargeSchema, firstIssueMessage, reservationInputSchema, type ReservationInput } from "./schemas";
import { lineAmount } from "./stay-math";

/**
 * Regles metier des reservations : une ou plusieurs chambres pour un client, sur
 * les memes dates. Cycle : Confirmee -> En sejour (check-in) -> Terminee (check-out),
 * ou Annulee avant l'arrivee.
 */

const STALE = "Le statut de cette réservation vient de changer. Rechargez la page.";

/** Chambres demandees : existence, mise en service, capacite et disponibilite sur la periode. */
export async function checkRooms(
  tx: Prisma.TransactionClient,
  rooms: ReservationInput["rooms"],
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string,
) {
  const ids = rooms.map((r) => r.roomId);
  const found = await tx.room.findMany({ where: { id: { in: ids } }, include: { roomType: true } });
  const byId = new Map(found.map((r) => [r.id, r]));

  for (const line of rooms) {
    const room = byId.get(line.roomId);
    if (!room) throw new BusinessError("Une des chambres sélectionnées n'existe plus. Rechargez la page.");
    if (room.outOfService) {
      throw new BusinessError(`La chambre ${room.number} est hors service${room.notes ? ` (${room.notes})` : ""}.`);
    }
    const persons = line.adults + line.children;
    if (persons > room.roomType.capacity) {
      throw new BusinessError(
        `Chambre ${room.number} (${room.roomType.name}) : ${persons} personnes pour une capacité de ${room.roomType.capacity}.`,
      );
    }
  }

  const [conflict] = await findConflicts(tx, ids, checkIn, checkOut, excludeReservationId);
  if (conflict) {
    throw new BusinessError(
      `La chambre ${conflict.room.number} est déjà réservée sur ces dates (${conflict.reservation.number}, ${formatDateRange(conflict.reservation.checkIn, conflict.reservation.checkOut)}).`,
    );
  }
}

function roomRows(rooms: ReservationInput["rooms"], currency: string) {
  return rooms.map((r) => ({
    roomId: r.roomId,
    adults: r.adults,
    children: r.children,
    nightlyRate: toStoredAmount(r.nightlyRate, currency),
  }));
}

function parse(raw: unknown) {
  const parsed = reservationInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: firstIssueMessage(parsed.error) };
  const input = parsed.data;
  return { ok: true as const, input, checkIn: parseDateInput(input.checkIn)!, checkOut: parseDateInput(input.checkOut)! };
}

export async function createReservation(
  actor: SessionUser,
  raw: unknown,
): Promise<ActionResult<{ receiptId: string | null }>> {
  const parsed = parse(raw);
  if (!parsed.ok) return fail(parsed.error);
  const { input, checkIn, checkOut } = parsed;

  const hotel = await getHotel();
  if (checkIn < todayDate()) return fail("La date d'arrivée ne peut pas être dans le passé.");
  if (!hotel.restaurantEnabled && input.mealPlan !== "CHAMBRE_SEULE") return fail(RESTAURANT_OFF);
  const currency = hotel.currency;

  return attempt(async () => {
    const result = await db.$transaction(async (tx) => {
      await checkRooms(tx, input.rooms, checkIn, checkOut);
      const guestId = await resolveGuest(tx, input.guest);
      const number = await nextNumber(tx, "reservation");
      const reservation = await tx.reservation.create({
        data: {
          number,
          guestId,
          checkIn,
          checkOut,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          mealPlan: input.mealPlan,
          mealPlanPrice: mealPlanPrice(input.mealPlan, hotel),
          cityTax: hotel.cityTax,
          vatRate: hotel.vatRate,
          currency,
          source: input.source,
          notes: input.notes || null,
          createdById: actor.id,
          rooms: { create: roomRows(input.rooms, currency) },
        },
      });

      let receiptId: string | null = null;
      if (input.deposit) {
        const folio = (await getFolio(reservation.id, tx))!;
        const amount = toStoredAmount(input.deposit.amount, currency);
        if (amount > folio.balance) {
          throw new BusinessError(`L'acompte dépasse le montant du séjour (${formatMoney(folio.balance, currency)}).`);
        }
        const receipt = await insertReceipt(tx, {
          reservationId: reservation.id,
          payerName: guestName(folio.reservation.guest),
          label: paymentLabel("CONFIRMEE", number, amount, folio.balance),
          amount,
          currency,
          method: input.deposit.method,
          reference: input.deposit.reference || null,
          balanceAfter: folio.balance - amount,
          createdById: actor.id,
        });
        receiptId = receipt.id;
      }
      return { id: reservation.id, receiptId };
    });
    return { ok: true as const, ...result };
  });
}

/** Modification (client, dates, chambres, formule) tant que le client n'est pas arrive. */
export async function updateReservation(actor: SessionUser, reservationId: string, raw: unknown): Promise<ActionResult> {
  const parsed = parse(raw);
  if (!parsed.ok) return fail(parsed.error);
  const { input, checkIn, checkOut } = parsed;

  const current = await db.reservation.findUnique({ where: { id: reservationId } });
  if (!current) return fail("Cette réservation n'existe plus.");
  if (current.status !== "CONFIRMEE") {
    return fail("Seule une réservation confirmée, avant l'arrivée du client, peut être modifiée.");
  }
  if (checkIn.getTime() !== current.checkIn.getTime() && checkIn < todayDate()) {
    return fail("La date d'arrivée ne peut pas être dans le passé.");
  }
  const hotel = await getHotel();
  const planChanged = input.mealPlan !== current.mealPlan;
  if (planChanged && !hotel.restaurantEnabled && input.mealPlan !== "CHAMBRE_SEULE") return fail(RESTAURANT_OFF);

  return attempt(async () => {
    await db.$transaction(async (tx) => {
      await checkRooms(tx, input.rooms, checkIn, checkOut, reservationId);
      const guestId = await resolveGuest(tx, input.guest);
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: "CONFIRMEE" },
        data: {
          guestId,
          checkIn,
          checkOut,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          mealPlan: input.mealPlan,
          // Le prix d'une formule inchangee reste celui convenu a la reservation.
          mealPlanPrice: planChanged ? mealPlanPrice(input.mealPlan, hotel) : current.mealPlanPrice,
          source: input.source,
          notes: input.notes || null,
        },
      });
      if (updated.count === 0) throw new BusinessError(STALE);
      await tx.reservationRoom.deleteMany({ where: { reservationId } });
      await tx.reservationRoom.createMany({
        data: roomRows(input.rooms, current.currency).map((row) => ({ ...row, reservationId })),
      });
    });
    return { ok: true as const, id: reservationId };
  });
}

/** Arrivee du client : a partir du jour prevu, chambres en service et liberees par le client precedent. */
export async function checkInReservation(actor: SessionUser, reservationId: string): Promise<ActionResult> {
  const r = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { rooms: { include: { room: true } } },
  });
  if (!r) return fail("Cette réservation n'existe plus.");
  if (r.status !== "CONFIRMEE") return fail("Le check-in n'est possible que pour une réservation confirmée.");
  const today = todayDate();
  if (today < r.checkIn) return fail(`Arrivée prévue le ${formatDate(r.checkIn)} : le check-in sera possible ce jour-là.`);
  if (today > r.checkOut || (today.getTime() === r.checkOut.getTime() && r.checkOut > r.checkIn)) {
    return fail("La date de départ est dépassée : modifiez les dates ou annulez la réservation.");
  }
  const blocked = r.rooms.find((x) => x.room.outOfService);
  if (blocked) return fail(`La chambre ${blocked.room.number} est hors service : attribuez une autre chambre avant le check-in.`);

  return attempt(async () => {
    await db.$transaction(async (tx) => {
      const occupied = await tx.reservationRoom.findFirst({
        where: {
          roomId: { in: r.rooms.map((x) => x.roomId) },
          reservation: { status: "EN_SEJOUR", id: { not: reservationId } },
        },
        include: { room: true, reservation: { include: { guest: true } } },
      });
      if (occupied) {
        throw new BusinessError(
          `La chambre ${occupied.room.number} est encore occupée par ${guestName(occupied.reservation.guest)} (${occupied.reservation.number}) : validez d'abord son départ.`,
        );
      }
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: "CONFIRMEE" },
        data: { status: "EN_SEJOUR", checkedInAt: new Date() },
      });
      if (updated.count === 0) throw new BusinessError(STALE);
    });
    return { ok: true as const, id: reservationId };
  });
}

/** Depart du client : note soldee et additions du restaurant closes. */
export async function checkOutReservation(actor: SessionUser, reservationId: string): Promise<ActionResult> {
  return attempt(async () => {
    await db.$transaction(async (tx) => {
      const folio = await getFolio(reservationId, tx);
      if (!folio) throw new BusinessError("Cette réservation n'existe plus.");
      const { reservation } = folio;
      if (reservation.status !== "EN_SEJOUR") {
        throw new BusinessError("Le départ ne peut être validé que pour un client en séjour.");
      }
      const open = await tx.restaurantOrder.findFirst({ where: { reservationId, status: "OUVERTE" } });
      if (open) {
        throw new BusinessError(
          `L'addition ${open.number} (${open.tableLabel}) est encore ouverte au restaurant : portez-la sur la note ou encaissez-la avant le départ.`,
        );
      }
      if (folio.balance > 0) {
        throw new BusinessError(
          `Reste à payer : ${formatMoney(folio.balance, reservation.currency)}. Encaissez le solde avant de valider le départ.`,
        );
      }
      const updated = await tx.reservation.updateMany({
        where: { id: reservationId, status: "EN_SEJOUR" },
        data: { status: "TERMINEE", checkedOutAt: new Date() },
      });
      if (updated.count === 0) throw new BusinessError(STALE);
    });
    return { ok: true as const, id: reservationId };
  });
}

/** Annulation avant l'arrivee, avec motif. Les acomptes deja encaisses restent sur leurs recus. */
export async function cancelReservation(actor: SessionUser, reservationId: string, reason: string): Promise<ActionResult> {
  const motive = reason.trim();
  if (motive.length < 3) return fail("Indiquez le motif de l'annulation.");
  const updated = await db.reservation.updateMany({
    where: { id: reservationId, status: "CONFIRMEE" },
    data: { status: "ANNULEE", cancelledAt: new Date(), cancelReason: motive.slice(0, 500) },
  });
  if (updated.count === 0) return fail("Seule une réservation confirmée (client pas encore arrivé) peut être annulée.");
  return { ok: true, id: reservationId };
}

function isOpen(status: string) {
  return isReservationStatus(status) && ACTIVE_RESERVATION_STATUSES.includes(status);
}

/** Prestation ajoutee a la note (spa, transfert…), avant l'arrivee ou pendant le sejour. */
export async function addCharge(actor: SessionUser, reservationId: string, raw: unknown): Promise<ActionResult> {
  const parsed = chargeSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueMessage(parsed.error));
  const input = parsed.data;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true, currency: true },
  });
  if (!reservation) return fail("Cette réservation n'existe plus.");
  if (!isOpen(reservation.status)) return fail("La note de séjour est close : aucune prestation ne peut être ajoutée.");

  const quantity = Math.round(input.quantity * 1000) / 1000;
  const unitPrice = toStoredAmount(input.unitPrice, reservation.currency);
  const charge = await db.charge.create({
    data: {
      reservationId,
      date: parseDateInput(input.date)!,
      designation: input.designation,
      quantity,
      unitPrice,
      total: lineAmount(quantity, unitPrice),
      createdById: actor.id,
    },
  });
  return { ok: true, id: charge.id };
}

/** Retrait d'une prestation ; renvoie l'identifiant de la reservation. */
export async function removeCharge(actor: SessionUser, chargeId: string): Promise<ActionResult> {
  const charge = await db.charge.findUnique({
    where: { id: chargeId },
    include: { reservation: { select: { status: true } } },
  });
  if (!charge) return fail("Cette prestation n'existe plus.");
  if (!isOpen(charge.reservation.status)) return fail("La note de séjour est close : elle ne peut plus être modifiée.");
  await db.charge.delete({ where: { id: chargeId } });
  return { ok: true, id: charge.reservationId };
}
