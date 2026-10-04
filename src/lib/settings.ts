import "server-only";
import { z } from "zod";
import { hashPassword, revokeOtherSessions, verifyPassword, type SessionUser } from "./auth";
import { db } from "./db";
import { DIRECTION_ONLY, fail, type ActionResult } from "./errors";
import { getHotel } from "./hotel";
import { SUPPORTED_CURRENCIES, toStoredAmount } from "./money";
import { toNumber } from "./schemas";

/** Reglages de l'hotel (direction) et du compte connecte. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (${max} caractères au maximum).`)
    .transform((v) => v || null);
const amount = (label: string) =>
  z.preprocess(toNumber, z.number({ invalid_type_error: `${label} invalide.` }).min(0, `${label} invalide.`).max(1e11));

const hotelSchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'hôtel est requis.").max(120),
  tagline: optional(160),
  stars: z.preprocess(toNumber, z.number().int().min(1).max(5)).default(5),
  address: optional(300),
  city: optional(80),
  country: z.string().trim().min(2, "Indiquez le pays.").max(80),
  phone: optional(40),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || EMAIL_RE.test(v), "E-mail de l'hôtel invalide.")
    .transform((v) => v || null),
  website: optional(200),
  taxId: optional(60),
  tradeRegister: optional(60),
  bankDetails: optional(500),
});

export async function updateHotelInfo(actor: SessionUser, raw: unknown): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const parsed = hotelSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const hotel = await getHotel();
  await db.hotel.update({ where: { id: hotel.id }, data: parsed.data });
  return { ok: true, id: hotel.id };
}

const ratesSchema = z.object({
  currency: z.string().refine((c) => SUPPORTED_CURRENCIES.some((s) => s.code === c), "Devise non prise en charge."),
  vatRate: z.preprocess(toNumber, z.number({ invalid_type_error: "Taux de TVA invalide." }).min(0).max(100, "Taux de TVA invalide.")),
  cityTax: amount("Taxe de séjour"),
  checkInTime: z.string().regex(TIME_RE, "Heure d'arrivée invalide."),
  checkOutTime: z.string().regex(TIME_RE, "Heure de départ invalide."),
  quoteValidityDays: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: "Validité des devis invalide." }).int().min(1, "Validité des devis : 1 jour au minimum.").max(365),
  ),
  quoteTerms: optional(3000),
});

export async function updateRates(actor: SessionUser, raw: unknown): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const parsed = ratesSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const hotel = await getHotel();

  // Les montants sont stockes dans la devise de l'hotel : elle se choisit avant de saisir des tarifs.
  if (d.currency !== hotel.currency) {
    const priced = await Promise.all([db.roomType.count(), db.menuItem.count(), db.reservation.count(), db.quote.count(), db.receipt.count()]);
    if (priced.some((n) => n > 0)) {
      return fail("La devise ne peut plus être changée : des tarifs, réservations, devis ou reçus existent déjà dans la devise actuelle.");
    }
  }

  await db.hotel.update({
    where: { id: hotel.id },
    data: {
      ...d,
      vatRate: Math.round(d.vatRate * 100) / 100,
      cityTax: toStoredAmount(d.cityTax, d.currency),
    },
  });
  return { ok: true, id: hotel.id };
}

const restaurantSchema = z.object({
  restaurantEnabled: z.boolean(),
  restaurantName: optional(120),
  breakfastPrice: amount("Prix du petit-déjeuner"),
  halfBoardPrice: amount("Prix de la demi-pension"),
  fullBoardPrice: amount("Prix de la pension complète"),
});

export async function updateRestaurant(actor: SessionUser, raw: unknown): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const parsed = restaurantSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const hotel = await getHotel();
  await db.hotel.update({
    where: { id: hotel.id },
    data: {
      restaurantEnabled: d.restaurantEnabled,
      restaurantName: d.restaurantName,
      breakfastPrice: toStoredAmount(d.breakfastPrice, hotel.currency),
      halfBoardPrice: toStoredAmount(d.halfBoardPrice, hotel.currency),
      fullBoardPrice: toStoredAmount(d.fullBoardPrice, hotel.currency),
    },
  });
  return { ok: true, id: hotel.id };
}

export async function updateProfile(actor: SessionUser, raw: { name: string; jobTitle: string }): Promise<ActionResult> {
  const name = raw.name.trim();
  if (name.length < 2 || name.length > 120) return fail("Indiquez votre nom complet.");
  await db.user.update({ where: { id: actor.id }, data: { name, jobTitle: raw.jobTitle.trim().slice(0, 80) || null } });
  return { ok: true, id: actor.id };
}

/** Changement de son mot de passe ; les autres sessions du compte sont fermees. */
export async function changePassword(
  actor: SessionUser,
  raw: { current: string; next: string; confirm: string },
): Promise<ActionResult> {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verifyPassword(raw.current, user.passwordHash))) return fail("Mot de passe actuel incorrect.");
  if (raw.next.length < 8) return fail("Le nouveau mot de passe doit contenir au moins 8 caractères.");
  if (raw.next !== raw.confirm) return fail("La confirmation ne correspond pas au nouveau mot de passe.");
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(raw.next) } });
  await revokeOtherSessions(actor.id);
  return { ok: true, id: actor.id };
}
