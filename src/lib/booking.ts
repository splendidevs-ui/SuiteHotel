import "server-only";
import type { SessionUser } from "./auth";
import { draftToReservationInput, type BookingDraft } from "./booking-draft";
import { db } from "./db";
import { RESTAURANT_OFF, attempt, fail } from "./errors";
import { parseDateInput, todayDate } from "./format";
import { getHotel } from "./hotel";
import { toInputAmount } from "./money";
import { checkRooms, createReservation } from "./reservations";
import { firstIssueMessage, stayStepSchema } from "./schemas";

/**
 * Regles des etapes du parcours de reservation. Le brouillon lui-meme vit dans la
 * session (lib/auth.ts) ; ces fonctions le valident et renvoient sa nouvelle version.
 */

type StepResult = { ok: true; draft: BookingDraft } | { ok: false; error: string };

/** Etape 1 : chambres existantes, en service, d'une categorie proposee ; occupants et tarif par defaut. */
export async function applyRoomsStep(draft: BookingDraft): Promise<StepResult> {
  const ids = draft.rooms.map((r) => r.roomId);
  if (ids.length === 0) return fail("Choisissez au moins une chambre.");
  if (new Set(ids).size !== ids.length) return fail("Une même chambre est sélectionnée deux fois.");

  const [rooms, hotel] = await Promise.all([
    db.room.findMany({ where: { id: { in: ids } }, include: { roomType: true } }),
    getHotel(),
  ]);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const lines: BookingDraft["rooms"] = [];
  for (const line of draft.rooms) {
    const room = byId.get(line.roomId);
    if (!room || !room.roomType.active) return fail("Une des chambres choisies n'est plus proposée. Rechargez la page.");
    if (room.outOfService) return fail(`La chambre ${room.number} est hors service${room.notes ? ` (${room.notes})` : ""}.`);
    lines.push({
      roomId: room.id,
      adults: line.adults || String(Math.min(2, room.roomType.capacity)),
      children: line.children || "0",
      nightlyRate: line.nightlyRate || toInputAmount(room.roomType.basePrice, hotel.currency),
    });
  }
  return { ok: true, draft: { ...draft, rooms: lines, done: { chambres: true, sejour: draft.done.sejour } } };
}

/** Etape 2 : dates, formule, occupants ; chaque chambre choisie doit etre libre sur la periode. */
export async function applyStayStep(draft: BookingDraft): Promise<StepResult> {
  if (!draft.done.chambres) return fail("Choisissez d'abord les chambres.");
  const parsed = stayStepSchema.safeParse({
    checkIn: draft.checkIn,
    checkInTime: draft.checkInTime,
    checkOut: draft.checkOut,
    checkOutTime: draft.checkOutTime,
    mealPlan: draft.mealPlan,
    source: draft.source,
    rooms: draft.rooms,
  });
  if (!parsed.success) return fail(firstIssueMessage(parsed.error));
  const stay = parsed.data;
  const checkIn = parseDateInput(stay.checkIn)!;
  const checkOut = parseDateInput(stay.checkOut)!;
  if (checkIn < todayDate()) return fail("La date d'arrivée ne peut pas être dans le passé.");
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled && stay.mealPlan !== "CHAMBRE_SEULE") return fail(RESTAURANT_OFF);

  const checked = await attempt(async () => {
    await checkRooms(db, stay.rooms, checkIn, checkOut);
    return { ok: true as const };
  });
  if (!checked.ok) return checked;
  return { ok: true, draft: { ...draft, done: { chambres: true, sejour: true } } };
}

/** Etape 3 : cree la reservation (toutes les regles sont reverifiees dans la transaction). */
export async function confirmDraft(actor: SessionUser, draft: BookingDraft) {
  if (!draft.done.chambres || !draft.done.sejour) {
    return fail("Complétez d'abord les étapes Chambres et Séjour.");
  }
  return createReservation(actor, draftToReservationInput(draft));
}
