import { z } from "zod";
import {
  MEAL_PLANS,
  PAYMENT_METHODS,
  RESERVATION_SOURCES,
  type MealPlan,
  type PaymentMethod,
  type ReservationSource,
} from "./constants";
import { parseDateInput } from "./format";
import { daysBetween } from "./stay-math";

/**
 * Validation des saisies (serveur) et types des formulaires (client).
 * Les formulaires envoient des chaines : "12,5" ou "1 250 000" sont acceptes.
 */

export function toNumber(value: unknown) {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (max: number) =>
  z.string().trim().max(max, `Texte trop long (${max} caractères au maximum).`).default("");

const email = (message: string) => text(200).refine((v) => v === "" || EMAIL_RE.test(v), message);

const dateInput = (message: string) => z.string().refine((v) => parseDateInput(v) !== null, message);

/** Heure "HH:MM" d'un champ date et heure. */
const timeInput = (message: string, fallback: string) => z.string().trim().regex(TIME_RE, message).default(fallback);

function integer(label: string, min: number, max: number, emptyAs?: number) {
  return z.preprocess(
    (v) => (v === "" || v == null ? (emptyAs ?? Number.NaN) : toNumber(v)),
    z
      .number({ invalid_type_error: `${label} invalide.` })
      .int(`${label} invalide.`)
      .min(min, `${label} : ${min} au minimum.`)
      .max(max, `${label} : ${max} au maximum.`),
  );
}

function money(label: string, { positive = false } = {}) {
  const base = z.number({ invalid_type_error: `${label} invalide.` }).max(1e11, `${label} trop élevé.`);
  return z.preprocess(
    toNumber,
    positive
      ? base.positive(`${label} : le montant doit être supérieur à zéro.`)
      : base.min(0, `${label} : le montant ne peut pas être négatif.`),
  );
}

function quantity(label = "quantité") {
  return z.preprocess(
    toNumber,
    z
      .number({ invalid_type_error: `${label} invalide.` })
      .positive(`${label} : doit être supérieure à zéro.`)
      .max(1e6, `${label} trop élevée.`),
  );
}

const paymentMethod = z.enum(PAYMENT_METHODS, {
  errorMap: () => ({ message: "Choisissez le mode de règlement." }),
});

// ----- Clients -----

export const guestFieldsSchema = z.object({
  firstName: z.string().trim().min(1, "Indiquez le prénom du client.").max(80, "Prénom trop long."),
  lastName: z.string().trim().min(1, "Indiquez le nom du client.").max(80, "Nom trop long."),
  email: email("E-mail du client invalide."),
  phone: text(40),
  nationality: text(60),
  idType: text(60),
  idNumber: text(60),
  company: text(120),
});

export const guestProfileSchema = guestFieldsSchema.extend({
  address: text(300),
  notes: text(2000),
  vip: z.boolean().default(false),
});

/** Client d'une reservation ou d'un devis : fiche existante, ou nouvelle fiche saisie a la volee. */
export const guestRefSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), guestId: z.string().min(1, "Choisissez un client.") }),
  guestFieldsSchema.extend({ mode: z.literal("new") }),
]);

export type GuestRef = z.infer<typeof guestRefSchema>;

// ----- Sejour -----

const stayFields = {
  checkIn: dateInput("Date d'arrivée invalide."),
  checkOut: dateInput("Date de départ invalide."),
  mealPlan: z.enum(MEAL_PLANS, { errorMap: () => ({ message: "Formule de restauration invalide." }) }),
};

/** Heures prevues d'arrivee et de depart : les champs de dates du sejour sont horodates. */
const stayTimes = {
  checkInTime: timeInput("Heure d'arrivée invalide.", "14:00"),
  checkOutTime: timeInput("Heure de départ invalide.", "12:00"),
};

function checkStay(
  d: { checkIn: string; checkOut: string; checkInTime?: string; checkOutTime?: string },
  ctx: z.RefinementCtx,
) {
  if (!parseDateInput(d.checkIn) || !parseDateInput(d.checkOut)) return;
  // Depart le jour meme autorise (sejour de jour, facture une nuit).
  const nights = daysBetween(d.checkIn, d.checkOut);
  if (nights < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkOut"],
      message: "La date de départ ne peut pas précéder la date d'arrivée.",
    });
  } else if (nights === 0 && d.checkInTime && d.checkOutTime && d.checkOutTime <= d.checkInTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkOut"],
      message: "Départ le jour de l'arrivée : l'heure de départ doit suivre l'heure d'arrivée.",
    });
  } else if (nights > 90) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkOut"], message: "Un séjour est limité à 90 nuits." });
  }
}

export const reservationRoomSchema = z.object({
  roomId: z.string().min(1, "chambre manquante."),
  adults: integer("nombre d'adultes", 1, 10),
  children: integer("nombre d'enfants", 0, 10, 0),
  nightlyRate: money("tarif par nuit"),
});

export const depositSchema = z.object({
  amount: money("Acompte", { positive: true }),
  method: paymentMethod,
  reference: text(120),
});

export const reservationInputSchema = z
  .object({
    guest: guestRefSchema,
    ...stayFields,
    ...stayTimes,
    source: z
      .enum(RESERVATION_SOURCES, { errorMap: () => ({ message: "Origine de la réservation invalide." }) })
      .default("DIRECT"),
    notes: text(2000),
    rooms: z
      .array(reservationRoomSchema)
      .min(1, "Sélectionnez au moins une chambre.")
      .max(60, "Une réservation est limitée à 60 chambres."),
    deposit: depositSchema.nullish(),
  })
  .superRefine((d, ctx) => {
    checkStay(d, ctx);
    const ids = d.rooms.map((r) => r.roomId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rooms"], message: "Une même chambre est sélectionnée deux fois." });
    }
  });

export type ReservationInput = z.infer<typeof reservationInputSchema>;

/** Etape « Sejour » du parcours de reservation : dates et heures, formule, occupants et tarifs. */
export const stayStepSchema = z
  .object({
    ...stayFields,
    ...stayTimes,
    source: z
      .enum(RESERVATION_SOURCES, { errorMap: () => ({ message: "Origine de la réservation invalide." }) })
      .default("DIRECT"),
    rooms: z
      .array(reservationRoomSchema)
      .min(1, "Choisissez au moins une chambre.")
      .max(60, "Une réservation est limitée à 60 chambres."),
  })
  .superRefine((d, ctx) => checkStay(d, ctx));

// ----- Devis -----

export const quoteRoomSchema = z.object({
  roomTypeId: z.string().min(1, "choisissez une catégorie de chambre."),
  quantity: integer("nombre de chambres", 1, 50),
  adults: integer("adultes par chambre", 1, 10),
  children: integer("enfants par chambre", 0, 10, 0),
  nightlyRate: money("tarif par nuit"),
});

export const extraSchema = z.object({
  designation: z
    .string()
    .trim()
    .min(1, "indiquez la désignation.")
    .max(200, "désignation trop longue (200 caractères au maximum)."),
  quantity: quantity(),
  unitPrice: money("prix unitaire"),
});

export const quoteInputSchema = z
  .object({
    guest: guestRefSchema,
    ...stayFields,
    issueDate: dateInput("Date d'émission invalide."),
    validUntil: dateInput("Date de validité invalide."),
    notes: text(5000),
    rooms: z
      .array(quoteRoomSchema)
      .min(1, "Ajoutez au moins une catégorie de chambre.")
      .max(30, "Un devis est limité à 30 lignes d'hébergement."),
    extras: z.array(extraSchema).max(50, "Un devis est limité à 50 prestations.").default([]),
  })
  .superRefine((d, ctx) => {
    checkStay(d, ctx);
    if (parseDateInput(d.issueDate) && parseDateInput(d.validUntil) && d.validUntil < d.issueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "La date de validité doit être postérieure à la date d'émission.",
      });
    }
  });

export type QuoteInput = z.infer<typeof quoteInputSchema>;

// ----- Encaissements et prestations -----

export const paymentSchema = z.object({
  amount: money("Montant", { positive: true }),
  method: paymentMethod,
  reference: text(120),
  payerName: text(200),
});

export const chargeSchema = z.object({
  designation: z.string().trim().min(1, "Indiquez la prestation.").max(200, "Désignation trop longue."),
  quantity: quantity("Quantité"),
  unitPrice: money("Prix unitaire"),
  date: dateInput("Date de la prestation invalide."),
});

/** Premier message d'erreur lisible, avec le numero de la ligne concernee. */
export function firstIssueMessage(
  error: z.ZodError,
  lists: Record<string, string> = { rooms: "Chambre", extras: "Prestation" },
) {
  const issue = error.issues[0];
  if (!issue) return "Formulaire invalide.";
  const [root, index] = issue.path;
  if (typeof root === "string" && lists[root] && typeof index === "number") {
    return `${lists[root]} ${index + 1} : ${issue.message}`;
  }
  return issue.message;
}

// ----- Etat des formulaires cote client (les nombres restent des chaines pendant la saisie) -----

export type GuestDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  idType: string;
  idNumber: string;
  company: string;
};

export const EMPTY_GUEST: GuestDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  nationality: "",
  idType: "",
  idNumber: "",
  company: "",
};

export type GuestRefValues = { mode: "existing" | "new"; guestId: string; draft: GuestDraft };

export function guestRefPayload(value: GuestRefValues) {
  return value.mode === "existing"
    ? { mode: "existing" as const, guestId: value.guestId }
    : { mode: "new" as const, ...value.draft };
}

export type ReservationFormRoom = { roomId: string; adults: string; children: string; nightlyRate: string };

export type ReservationFormValues = {
  guest: GuestRefValues;
  checkIn: string;
  /** Heure prevue d'arrivee, "HH:MM". */
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  mealPlan: MealPlan;
  source: ReservationSource;
  notes: string;
  rooms: ReservationFormRoom[];
  deposit: { enabled: boolean; amount: string; method: PaymentMethod; reference: string };
};

export type QuoteFormRoom = {
  /** Cle React stable, jamais envoyee au serveur. */
  key: string;
  roomTypeId: string;
  quantity: string;
  adults: string;
  children: string;
  nightlyRate: string;
};

export type QuoteFormExtra = { key: string; designation: string; quantity: string; unitPrice: string };

export type QuoteFormValues = {
  guest: GuestRefValues;
  checkIn: string;
  checkOut: string;
  mealPlan: MealPlan;
  issueDate: string;
  validUntil: string;
  notes: string;
  rooms: QuoteFormRoom[];
  extras: QuoteFormExtra[];
};
