import { z } from "zod";
import { MEAL_PLANS, PAYMENT_METHODS, RESERVATION_SOURCES } from "./constants";
import { addDaysToDateInput } from "./format";
import { EMPTY_GUEST, guestRefPayload } from "./schemas";

/**
 * Reservation en cours, conservee dans la session de la receptionniste pendant le
 * parcours en trois etapes : chambres -> sejour -> client. Rien n'est reserve avant
 * la confirmation ; la session garde la saisie si l'on change d'etape, recharge la
 * page ou consulte un autre ecran entre-temps. Module sans acces serveur : partage
 * par le parcours (client) et les actions (serveur).
 */

const text = (max: number, fallback = "") => z.string().max(max).catch(fallback);

const draftRoom = z.object({
  roomId: z.string().min(1).max(64),
  adults: text(4),
  children: text(4, "0"),
  nightlyRate: text(20),
});

export const DEFAULT_CHECK_IN_TIME = "14:00";
export const DEFAULT_CHECK_OUT_TIME = "12:00";

export const bookingDraftSchema = z.object({
  startedAt: z
    .string()
    .max(40)
    .catch(() => new Date().toISOString()),
  rooms: z.array(draftRoom).max(60).catch([]),
  checkIn: text(10),
  /** Heures prevues d'arrivee et de depart : les champs de dates du sejour sont horodates. */
  checkInTime: text(5, DEFAULT_CHECK_IN_TIME),
  checkOut: text(10),
  checkOutTime: text(5, DEFAULT_CHECK_OUT_TIME),
  mealPlan: z.enum(MEAL_PLANS).catch("CHAMBRE_SEULE"),
  source: z.enum(RESERVATION_SOURCES).catch("DIRECT"),
  notes: text(2000),
  guest: z
    .object({
      mode: z.enum(["existing", "new"]).catch("existing"),
      guestId: text(64),
      draft: z
        .object({
          firstName: text(80),
          lastName: text(80),
          email: text(200),
          phone: text(40),
          nationality: text(60),
          idType: text(60),
          idNumber: text(60),
          company: text(120),
        })
        .catch(EMPTY_GUEST),
    })
    .catch({ mode: "existing", guestId: "", draft: EMPTY_GUEST }),
  deposit: z
    .object({
      enabled: z.boolean().catch(false),
      amount: text(20),
      method: z.enum(PAYMENT_METHODS).catch("CARTE"),
      reference: text(120),
    })
    .catch({ enabled: false, amount: "", method: "CARTE", reference: "" }),
  /** Etapes validees par le serveur (bouton « Continuer »). */
  done: z
    .object({ chambres: z.boolean().catch(false), sejour: z.boolean().catch(false) })
    .catch({ chambres: false, sejour: false }),
});

export type BookingDraft = z.infer<typeof bookingDraftSchema>;
export type BookingStep = "chambres" | "sejour" | "client";

export function newBookingDraft(
  today: string,
  checkInTime = DEFAULT_CHECK_IN_TIME,
  checkOutTime = DEFAULT_CHECK_OUT_TIME,
): BookingDraft {
  return {
    startedAt: new Date().toISOString(),
    rooms: [],
    checkIn: today,
    checkInTime,
    checkOut: addDaysToDateInput(today, 1),
    checkOutTime,
    mealPlan: "CHAMBRE_SEULE",
    source: "DIRECT",
    notes: "",
    guest: { mode: "existing", guestId: "", draft: EMPTY_GUEST },
    deposit: { enabled: false, amount: "", method: "CARTE", reference: "" },
    done: { chambres: false, sejour: false },
  };
}

/** Lecture tolerante du brouillon stocke dans la session ; null s'il n'y en a pas. */
export function parseDraft(raw: string | null | undefined): BookingDraft | null {
  if (!raw) return null;
  try {
    return bookingDraftSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const EDITABLE = [
  "rooms",
  "checkIn",
  "checkInTime",
  "checkOut",
  "checkOutTime",
  "mealPlan",
  "source",
  "notes",
  "guest",
  "deposit",
] as const;

/**
 * Etapes encore valides apres une modification : une chambre ajoutee oblige a
 * revalider les chambres ; toute modification du sejour (dates, heures, formule,
 * occupants, tarifs, chambres) oblige a revalider le sejour. Le client et les notes
 * ne changent rien.
 */
export function withProgress(before: BookingDraft, after: BookingDraft): BookingDraft {
  const known = (id: string) => before.rooms.some((r) => r.roomId === id);
  const onlyKnownRooms = after.rooms.length > 0 && after.rooms.every((r) => known(r.roomId));
  const sameStay =
    before.checkIn === after.checkIn &&
    before.checkInTime === after.checkInTime &&
    before.checkOut === after.checkOut &&
    before.checkOutTime === after.checkOutTime &&
    before.mealPlan === after.mealPlan &&
    before.source === after.source &&
    JSON.stringify(before.rooms) === JSON.stringify(after.rooms);
  return {
    ...after,
    done: { chambres: before.done.chambres && onlyKnownRooms, sejour: before.done.sejour && sameStay },
  };
}

/** Applique une saisie (non fiable) au brouillon : champs connus seulement, formats bornes. */
export function mergeDraft(current: BookingDraft, patch: unknown): BookingDraft {
  const source = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};
  const picked: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in source) picked[key] = source[key];
  const next = bookingDraftSchema.parse({ ...current, ...picked, startedAt: current.startedAt, done: current.done });
  return withProgress(current, next);
}

/** Donnees completes de la reservation, pour la confirmation. */
export function draftToReservationInput(draft: BookingDraft) {
  return {
    guest: guestRefPayload(draft.guest),
    checkIn: draft.checkIn,
    checkInTime: draft.checkInTime,
    checkOut: draft.checkOut,
    checkOutTime: draft.checkOutTime,
    mealPlan: draft.mealPlan,
    source: draft.source,
    notes: draft.notes,
    rooms: draft.rooms,
    deposit: draft.deposit.enabled
      ? { amount: draft.deposit.amount, method: draft.deposit.method, reference: draft.deposit.reference }
      : null,
  };
}
