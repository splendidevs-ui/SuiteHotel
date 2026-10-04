import "server-only";
import type { SessionUser } from "./auth";
import { availableRooms } from "./availability";
import { QUOTE_TRANSITIONS, isQuoteEditable, isQuoteStatus, mealPlanPrice } from "./constants";
import { db } from "./db";
import { BusinessError, RESTAURANT_OFF, attempt, fail, type ActionResult } from "./errors";
import { formatDate, parseDateInput, todayDate } from "./format";
import { resolveGuest } from "./guests";
import { getHotel, type Hotel } from "./hotel";
import { toStoredAmount } from "./money";
import { nextNumber } from "./numbering";
import { firstIssueMessage, quoteInputSchema, type QuoteInput } from "./schemas";
import { lineAmount, nightsBetween, stayTotals } from "./stay-math";

/**
 * Devis de sejour : par categorie de chambre (les numeros sont attribues quand le
 * devis devient une reservation), formule, prestations, TVA et taxe de sejour.
 * Cycle : Brouillon -> Envoye -> Accepte / Refuse ; "Transformer en reservation"
 * attribue des chambres libres et reprend tarifs et prestations a l'identique.
 */

const QUOTE_LISTS = { rooms: "Hébergement, ligne", extras: "Prestation" };

function parse(raw: unknown) {
  const parsed = quoteInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true as const, input: parsed.data }
    : { ok: false as const, error: firstIssueMessage(parsed.error, QUOTE_LISTS) };
}

/** Controle les categories et calcule les montants stockes. */
async function prepare(input: QuoteInput, hotel: Hotel) {
  const types = await db.roomType.findMany({ where: { id: { in: input.rooms.map((r) => r.roomTypeId) } } });
  const byId = new Map(types.map((t) => [t.id, t]));
  input.rooms.forEach((line, i) => {
    const type = byId.get(line.roomTypeId);
    if (!type || !type.active) throw new BusinessError(`Hébergement, ligne ${i + 1} : cette catégorie n'est plus proposée.`);
    const persons = line.adults + line.children;
    if (persons > type.capacity) {
      throw new BusinessError(
        `Hébergement, ligne ${i + 1} (${type.name}) : ${persons} personnes par chambre pour une capacité de ${type.capacity}.`,
      );
    }
  });

  const currency = hotel.currency;
  const rooms = input.rooms.map((r, position) => ({
    roomTypeId: r.roomTypeId,
    position,
    quantity: r.quantity,
    adults: r.adults,
    children: r.children,
    nightlyRate: toStoredAmount(r.nightlyRate, currency),
  }));
  const extras = input.extras.map((e, position) => {
    const quantity = Math.round(e.quantity * 1000) / 1000;
    const unitPrice = toStoredAmount(e.unitPrice, currency);
    return { position, designation: e.designation, quantity, unitPrice, total: lineAmount(quantity, unitPrice) };
  });

  const checkIn = parseDateInput(input.checkIn)!;
  const checkOut = parseDateInput(input.checkOut)!;
  const planPrice = mealPlanPrice(input.mealPlan, hotel);
  const totals = stayTotals({
    nights: nightsBetween(checkIn, checkOut),
    rooms,
    mealPlanPrice: planPrice,
    extras: extras.reduce((sum, e) => sum + e.total, 0),
    vatRate: hotel.vatRate,
    cityTax: hotel.cityTax,
  });

  return {
    fields: {
      issueDate: parseDateInput(input.issueDate)!,
      validUntil: parseDateInput(input.validUntil)!,
      checkIn,
      checkOut,
      mealPlan: input.mealPlan,
      mealPlanPrice: planPrice,
      cityTax: hotel.cityTax,
      vatRate: hotel.vatRate,
      currency,
      notes: input.notes || null,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      cityTaxAmount: totals.cityTaxAmount,
      total: totals.total,
    },
    rooms,
    extras,
  };
}

export async function createQuote(actor: SessionUser, raw: unknown): Promise<ActionResult> {
  const parsed = parse(raw);
  if (!parsed.ok) return fail(parsed.error);
  const { input } = parsed;
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled && input.mealPlan !== "CHAMBRE_SEULE") return fail(RESTAURANT_OFF);

  return attempt(async () => {
    const prepared = await prepare(input, hotel);
    const quote = await db.$transaction(async (tx) => {
      const guestId = await resolveGuest(tx, input.guest);
      const number = await nextNumber(tx, "quote");
      return tx.quote.create({
        data: {
          ...prepared.fields,
          number,
          guestId,
          status: "BROUILLON",
          createdById: actor.id,
          rooms: { create: prepared.rooms },
          extras: { create: prepared.extras },
        },
      });
    });
    return { ok: true as const, id: quote.id };
  });
}

export async function updateQuote(actor: SessionUser, quoteId: string, raw: unknown): Promise<ActionResult> {
  const parsed = parse(raw);
  if (!parsed.ok) return fail(parsed.error);
  const { input } = parsed;

  const current = await db.quote.findUnique({ where: { id: quoteId }, include: { reservation: { select: { id: true } } } });
  if (!current) return fail("Ce devis n'existe plus.");
  if (current.reservation) return fail("Ce devis a été transformé en réservation : il ne peut plus être modifié.");
  if (!isQuoteEditable(current.status)) return fail("Ce devis est clos (accepté ou refusé). Rouvrez-le avant de le modifier.");
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled && input.mealPlan !== "CHAMBRE_SEULE" && input.mealPlan !== current.mealPlan) {
    return fail(RESTAURANT_OFF);
  }

  return attempt(async () => {
    const prepared = await prepare(input, hotel);
    await db.$transaction(async (tx) => {
      const guestId = await resolveGuest(tx, input.guest);
      const updated = await tx.quote.updateMany({
        where: { id: quoteId, status: { in: ["BROUILLON", "ENVOYE"] } },
        data: { ...prepared.fields, guestId },
      });
      if (updated.count === 0) throw new BusinessError("Le statut de ce devis vient de changer. Rechargez la page.");
      await tx.quoteRoom.deleteMany({ where: { quoteId } });
      await tx.quoteExtra.deleteMany({ where: { quoteId } });
      await tx.quoteRoom.createMany({ data: prepared.rooms.map((r) => ({ ...r, quoteId })) });
      await tx.quoteExtra.createMany({ data: prepared.extras.map((e) => ({ ...e, quoteId })) });
    });
    return { ok: true as const, id: quoteId };
  });
}

export async function changeQuoteStatus(actor: SessionUser, quoteId: string, to: string): Promise<ActionResult> {
  const current = await db.quote.findUnique({ where: { id: quoteId }, include: { reservation: { select: { id: true } } } });
  if (!current || !isQuoteStatus(current.status)) return fail("Ce devis n'existe plus.");
  if (current.reservation) return fail("Ce devis a été transformé en réservation : son statut ne change plus.");
  if (!isQuoteStatus(to) || !QUOTE_TRANSITIONS[current.status].some((t) => t.to === to)) {
    return fail("Ce changement de statut n'est pas possible.");
  }
  const updated = await db.quote.updateMany({ where: { id: quoteId, status: current.status }, data: { status: to } });
  if (updated.count === 0) return fail("Le statut de ce devis vient d'être modifié. Rechargez la page.");
  return { ok: true, id: quoteId };
}

/**
 * Transforme le devis en reservation : attribue des chambres libres de chaque
 * categorie, reprend tarifs, formule, taxes et prestations. Renvoie l'id de la reservation.
 */
export async function convertQuote(actor: SessionUser, quoteId: string): Promise<ActionResult> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      rooms: { include: { roomType: true }, orderBy: { position: "asc" } },
      extras: { orderBy: { position: "asc" } },
      reservation: { select: { number: true } },
    },
  });
  if (!quote) return fail("Ce devis n'existe plus.");
  if (quote.reservation) return fail(`Ce devis a déjà été transformé en réservation (${quote.reservation.number}).`);
  if (quote.status === "REFUSE") return fail("Un devis refusé ne peut pas être transformé. Rouvrez-le d'abord.");
  if (quote.checkIn < todayDate()) {
    return fail("La date d'arrivée du devis est passée : modifiez les dates avant de le transformer en réservation.");
  }

  return attempt(async () => {
    const reservation = await db.$transaction(async (tx) => {
      const free = await availableRooms(quote.checkIn, quote.checkOut, tx);
      const taken = new Set<string>();
      const assignments: { roomId: string; adults: number; children: number; nightlyRate: number }[] = [];
      for (const line of quote.rooms) {
        const candidates = free.filter((r) => r.roomTypeId === line.roomTypeId && !taken.has(r.id));
        if (candidates.length < line.quantity) {
          throw new BusinessError(
            `Plus assez de chambres « ${line.roomType.name} » libres du ${formatDate(quote.checkIn)} au ${formatDate(quote.checkOut)} : ${line.quantity} demandée(s), ${candidates.length} disponible(s).`,
          );
        }
        for (const room of candidates.slice(0, line.quantity)) {
          taken.add(room.id);
          assignments.push({ roomId: room.id, adults: line.adults, children: line.children, nightlyRate: line.nightlyRate });
        }
      }

      const number = await nextNumber(tx, "reservation");
      const created = await tx.reservation.create({
        data: {
          number,
          guestId: quote.guestId,
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
          mealPlan: quote.mealPlan,
          mealPlanPrice: quote.mealPlanPrice,
          cityTax: quote.cityTax,
          vatRate: quote.vatRate,
          currency: quote.currency,
          source: "DEVIS",
          notes: `Issue du devis ${quote.number}.`,
          quoteId: quote.id,
          createdById: actor.id,
          rooms: { create: assignments },
          charges: {
            create: quote.extras.map((e) => ({
              date: quote.checkIn,
              designation: e.designation,
              quantity: e.quantity,
              unitPrice: e.unitPrice,
              total: e.total,
              createdById: actor.id,
            })),
          },
        },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTE" } });
      return created;
    });
    return { ok: true as const, id: reservation.id };
  });
}

/** Seul un brouillon peut etre supprime : un devis envoye au client reste dans l'historique. */
export async function deleteQuote(actor: SessionUser, quoteId: string): Promise<ActionResult> {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { reservation: { select: { id: true } } } });
  if (!quote) return fail("Ce devis n'existe plus.");
  if (quote.status !== "BROUILLON" || quote.reservation) return fail("Seul un devis au brouillon peut être supprimé.");
  await db.quote.delete({ where: { id: quoteId } });
  return { ok: true, id: quoteId };
}
