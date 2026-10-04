/**
 * Jeu de demonstration : un palace 5 etoiles a Abidjan, son equipe de reception,
 * 22 chambres, une carte de restaurant, et une activite realiste autour
 * d'aujourd'hui : clients en sejour, arrivees et departs du jour, reservations a
 * venir, devis a tous les statuts, recus (dont un annule) et additions.
 *
 *   npm run db:seed        (efface puis recree toutes les donnees)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mealPlanPrice, type MealPlan } from "../src/lib/constants";
import { addDaysToDateInput, parseDateInput, todayDateInput } from "../src/lib/format";
import { lineAmount, nightsBetween, orderTotals, stayTotals } from "../src/lib/stay-math";

const db = new PrismaClient();

const TODAY = todayDateInput();
const YEAR = TODAY.slice(0, 4);
/** Date calendaire (minuit UTC) a `offset` jours d'aujourd'hui. */
const day = (offset: number) => parseDateInput(addDaysToDateInput(TODAY, offset))!;
/** Instant a `offset` jours d'aujourd'hui, a l'heure donnee (heure d'Abidjan = UTC). */
const at = (offset: number, hour: number, minute = 0) => new Date(day(offset).getTime() + (hour * 60 + minute) * 60_000);

const counters = { RES: 0, DEV: 0, REC: 0, CMD: 0 };
const nextNumber = (prefix: keyof typeof counters) => `${prefix}-${YEAR}-${String(++counters[prefix]).padStart(4, "0")}`;

// ----- Hotel -----

const HOTEL = {
  id: "main",
  name: "Le Palais Ébène",
  tagline: "Hôtel & Spa · Lagune Ébrié",
  stars: 5,
  address: "Boulevard de la Corniche, Cocody",
  city: "Abidjan",
  country: "Côte d'Ivoire",
  phone: "+225 27 22 40 00 00",
  email: "reservation@palaisebene.ci",
  website: "www.palaisebene.ci",
  taxId: "1904567 K",
  tradeRegister: "CI-ABJ-2019-B-12345",
  bankDetails: "Banque Atlantique Côte d'Ivoire — IBAN CI93 CI000 01234 56789012345 67 — BIC ATCICIAB",
  currency: "XOF",
  vatRate: 18,
  cityTax: 2_000,
  checkInTime: "14:00",
  checkOutTime: "12:00",
  quoteValidityDays: 15,
  quoteTerms:
    "Acompte de 30 % à la confirmation, solde à l'arrivée.\nAnnulation sans frais jusqu'à 7 jours avant l'arrivée ; au-delà, l'acompte reste acquis.\nChambres disponibles à partir de 14 h, départ avant 12 h.",
  restaurantEnabled: true,
  restaurantName: "Le Baobab — Restaurant gastronomique",
  breakfastPrice: 25_000,
  halfBoardPrice: 60_000,
  fullBoardPrice: 95_000,
};

const STAFF = {
  aicha: { name: "Aïcha Diabaté", email: "direction@suitehotel.ci", role: "DIRECTION", jobTitle: "Directrice générale" },
  koffi: { name: "Koffi Brou", email: "koffi.brou@suitehotel.ci", role: "RECEPTION", jobTitle: "Chef de réception" },
  mariam: { name: "Mariam Koné", email: "mariam.kone@suitehotel.ci", role: "RECEPTION", jobTitle: "Réceptionniste" },
  serge: { name: "Serge Yao", email: "serge.yao@suitehotel.ci", role: "RECEPTION", jobTitle: "Réceptionniste de nuit" },
} as const;
type StaffKey = keyof typeof STAFF;

const ROOM_TYPES = [
  {
    key: "deluxe",
    name: "Chambre Deluxe",
    capacity: 2,
    basePrice: 185_000,
    size: 34,
    bed: "Lit King size",
    description: "Élégante et lumineuse, avec balcon sur les jardins tropicaux.",
    amenities: "Balcon privatif\nDouche à l'italienne\nMachine Nespresso\nWi-Fi haut débit",
    rooms: ["101", "102", "103", "104", "105", "106", "107", "108"],
    floor: 1,
  },
  {
    key: "prestige",
    name: "Chambre Prestige Vue Lagune",
    capacity: 2,
    basePrice: 235_000,
    size: 40,
    bed: "Lit King size",
    description: "Vue panoramique sur la lagune Ébrié et le Plateau.",
    amenities: "Vue lagune\nBaignoire et douche séparées\nPlateau de courtoisie\nPeignoirs en coton égyptien",
    rooms: ["201", "202", "203", "204", "205", "206"],
    floor: 2,
  },
  {
    key: "junior",
    name: "Suite Junior",
    capacity: 3,
    basePrice: 350_000,
    size: 58,
    bed: "Lit King size et canapé-lit",
    description: "Espace salon ouvert, idéal pour les familles.",
    amenities: "Coin salon\nBaignoire îlot\nAccès au Club Lounge\nMinibar offert",
    rooms: ["301", "302", "303", "304"],
    floor: 3,
  },
  {
    key: "executive",
    name: "Suite Exécutive",
    capacity: 4,
    basePrice: 520_000,
    size: 85,
    bed: "Chambre King size et chambre twin",
    description: "Deux chambres, salon et bureau, pour les séjours d'affaires en famille.",
    amenities: "Deux chambres\nBureau\nAccès au Club Lounge\nMajordome sur demande",
    rooms: ["401", "402", "403"],
    floor: 4,
  },
  {
    key: "presidential",
    name: "Suite Présidentielle",
    capacity: 4,
    basePrice: 1_450_000,
    size: 180,
    bed: "Deux chambres King size",
    description: "Le dernier étage, terrasse privée et service de majordome 24 h/24.",
    amenities: "Terrasse privée avec jacuzzi\nMajordome 24 h/24\nSalle à manger 8 couverts\nTransfert aéroport en berline",
    rooms: ["501"],
    floor: 5,
  },
] as const;

const MENU: [string, string, number, string?][] = [
  ["PETIT_DEJEUNER", "Petit-déjeuner continental", 18_000, "Viennoiseries, fruits frais, jus pressé, boisson chaude"],
  ["PETIT_DEJEUNER", "Petit-déjeuner ivoirien", 22_000, "Alloco, omelette aux légumes, bouillie de mil, jus de gingembre"],
  ["ENTREE", "Carpaccio de capitaine aux agrumes", 16_000],
  ["ENTREE", "Velouté de patate douce, huile de coco", 12_000],
  ["ENTREE", "Tartare de thon rouge, mangue et piment doux", 18_000],
  ["PLAT", "Filet de bœuf sauce poivre, gratin dauphinois", 38_000],
  ["PLAT", "Capitaine braisé, attiéké et sauce claire", 28_000],
  ["PLAT", "Homard grillé au beurre citronné", 65_000],
  ["PLAT", "Poulet kedjenou revisité", 24_000],
  ["PLAT", "Risotto crémeux aux cèpes", 26_000],
  ["DESSERT", "Moelleux au chocolat, cœur coulant", 11_000],
  ["DESSERT", "Salade de fruits exotiques", 8_000],
  ["DESSERT", "Crème brûlée à la vanille de Madagascar", 10_000],
  ["BOISSON", "Eau minérale (75 cl)", 3_000],
  ["BOISSON", "Jus de bissap frais", 5_000],
  ["BOISSON", "Café expresso", 3_500],
  ["BOISSON", "Cocktail signature Ébène", 12_000, "Rhum ambré, gingembre, fruit de la passion"],
  ["VIN", "Coupe de champagne", 18_000],
  ["VIN", "Champagne brut (bouteille)", 95_000],
  ["VIN", "Bordeaux rouge (bouteille)", 55_000],
];

const GUESTS = {
  kouadio: { firstName: "Jean-Marc", lastName: "Kouadio", vip: true, phone: "+225 07 07 12 34 56", email: "jm.kouadio@kouadio-holding.ci", nationality: "Ivoirienne", idType: "Passeport", idNumber: "20AB12345", company: "Kouadio Holding", notes: "Champagne brut en chambre à l'arrivée. Préfère le dernier étage." },
  durand: { firstName: "Olivier", lastName: "Durand", phone: "+33 6 12 34 56 78", email: "olivier.durand@exemple.fr", nationality: "Française", idType: "Passeport", idNumber: "19FR45821" },
  weber: { firstName: "Clara", lastName: "Weber", phone: "+49 151 2345 6789", email: "clara.weber@exemple.de", nationality: "Allemande", idType: "Passeport", idNumber: "C4X7Y2K91" },
  sow: { firstName: "Aminata", lastName: "Sow", phone: "+221 77 123 45 67", email: "aminata.sow@exemple.sn", nationality: "Sénégalaise", company: "Teranga Events" },
  mensah: { firstName: "David", lastName: "Mensah", phone: "+233 24 123 4567", email: "d.mensah@exemple.gh", nationality: "Ghanéenne" },
  benali: { firstName: "Nadia", lastName: "Benali", phone: "+212 6 61 23 45 67", email: "nadia.benali@exemple.ma", nationality: "Marocaine" },
  okafor: { firstName: "Grace", lastName: "Okafor", vip: true, phone: "+234 803 123 4567", email: "grace.okafor@okafor-energy.ng", nationality: "Nigériane", company: "Okafor Energy Ltd" },
  lambert: { firstName: "Sophie", lastName: "Lambert", phone: "+32 470 12 34 56", email: "sophie.lambert@exemple.be", nationality: "Belge" },
  traore: { firstName: "Moussa", lastName: "Traoré", phone: "+223 76 12 34 56", nationality: "Malienne" },
  bamba: { firstName: "Fatou", lastName: "Bamba", phone: "+225 05 44 55 66 77", email: "fatou.bamba@exemple.ci", nationality: "Ivoirienne", idType: "Carte nationale d'identité", idNumber: "CI00458712" },
  ndri: { firstName: "Yves", lastName: "N'Dri", phone: "+225 01 02 03 04 05", nationality: "Ivoirienne" },
  kouassi: { firstName: "Amani", lastName: "Kouassi", phone: "+225 07 88 99 00 11", email: "amani.kouassi@exemple.ci", nationality: "Ivoirienne" },
  cisse: { firstName: "Ibrahim", lastName: "Cissé", phone: "+225 07 58 12 12 12", email: "ibrahim.cisse@exemple.ci", nationality: "Ivoirienne", notes: "Voyage de noces : prévoir une attention en chambre." },
  coulibaly: { firstName: "Awa", lastName: "Coulibaly", phone: "+225 05 06 07 08 09", email: "awa.coulibaly@exemple.ci", nationality: "Ivoirienne" },
  yapi: { firstName: "Paul", lastName: "Yapi", phone: "+225 27 20 30 40 50", email: "p.yapi@ivoire-conseil.ci", company: "Ivoire Conseil SARL", nationality: "Ivoirienne" },
  ouattara: { firstName: "Chantal", lastName: "Ouattara", phone: "+225 07 11 22 33 44", nationality: "Ivoirienne" },
  aka: { firstName: "Laurent", lastName: "Aka", phone: "+225 01 23 45 67 89", email: "laurent.aka@exemple.ci", nationality: "Ivoirienne" },
  martin: { firstName: "Élodie", lastName: "Martin", phone: "+33 7 45 12 36 98", email: "elodie.martin@exemple.fr", nationality: "Française", idType: "Passeport", idNumber: "21FR88310" },
  diarra: { firstName: "Sékou", lastName: "Diarra", phone: "+223 66 77 88 99", nationality: "Malienne" },
} satisfies Record<string, { firstName: string; lastName: string; vip?: boolean; phone?: string; email?: string; nationality?: string; idType?: string; idNumber?: string; company?: string; notes?: string }>;
type GuestKey = keyof typeof GUESTS;

// ----- Devis -----

type QuoteDef = {
  key: string;
  guest: GuestKey;
  status: "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE";
  by: StaffKey;
  createdAt: Date;
  issue: number;
  validity: number;
  from: number;
  to: number;
  plan: MealPlan;
  rooms: { type: string; quantity: number; adults: number; children?: number }[];
  extras?: { designation: string; quantity: number; unitPrice: number }[];
};

const QUOTES: QuoteDef[] = [
  {
    key: "okafor",
    guest: "okafor",
    status: "ACCEPTE",
    by: "koffi",
    createdAt: at(-9, 10, 20),
    issue: -9,
    validity: 15,
    from: 5,
    to: 8,
    plan: "PENSION_COMPLETE",
    rooms: [{ type: "prestige", quantity: 3, adults: 1 }],
    extras: [
      { designation: "Location de salle de séminaire", quantity: 2, unitPrice: 350_000 },
      { designation: "Transfert aéroport", quantity: 3, unitPrice: 35_000 },
    ],
  },
  {
    key: "cisse",
    guest: "cisse",
    status: "ENVOYE",
    by: "mariam",
    createdAt: at(-2, 16, 5),
    issue: -2,
    validity: 12,
    from: 20,
    to: 25,
    plan: "DEMI_PENSION",
    rooms: [{ type: "executive", quantity: 1, adults: 2 }],
    extras: [
      { designation: "Décoration florale", quantity: 1, unitPrice: 75_000 },
      { designation: "Dîner privé sur la terrasse", quantity: 1, unitPrice: 180_000 },
    ],
  },
  {
    key: "coulibaly",
    guest: "coulibaly",
    status: "BROUILLON",
    by: "koffi",
    createdAt: at(-1, 11, 40),
    issue: -1,
    validity: 15,
    from: 30,
    to: 32,
    plan: "PETIT_DEJEUNER",
    rooms: [
      { type: "deluxe", quantity: 6, adults: 2 },
      { type: "junior", quantity: 1, adults: 2 },
    ],
    extras: [{ designation: "Décoration florale (salle de réception)", quantity: 1, unitPrice: 250_000 }],
  },
  {
    key: "yapi",
    guest: "yapi",
    status: "ENVOYE",
    by: "mariam",
    createdAt: at(-25, 9, 15),
    issue: -25,
    validity: 15,
    from: 4,
    to: 6,
    plan: "PETIT_DEJEUNER",
    rooms: [{ type: "deluxe", quantity: 2, adults: 1 }],
  },
  {
    key: "ouattara",
    guest: "ouattara",
    status: "REFUSE",
    by: "koffi",
    createdAt: at(-14, 15, 0),
    issue: -14,
    validity: 15,
    from: 15,
    to: 17,
    plan: "CHAMBRE_SEULE",
    rooms: [{ type: "presidential", quantity: 1, adults: 2 }],
  },
];

// ----- Reservations -----

type Payment = {
  /** Montant fixe, part du total ("share"), ou solde restant ("rest"). */
  amount?: number;
  share?: number;
  rest?: true;
  method: string;
  by: StaffKey;
  at: Date;
  reference?: string;
  cancel?: { by: StaffKey; at: Date; reason: string };
};

type ReservationDef = {
  key: string;
  guest: GuestKey;
  rooms: [room: string, adults: number, children?: number][];
  from: number;
  to: number;
  /** Heures prevues d'arrivee et de depart (par defaut, celles de l'hotel). */
  checkInTime?: string;
  checkOutTime?: string;
  plan: MealPlan;
  status: "CONFIRMEE" | "EN_SEJOUR" | "TERMINEE" | "ANNULEE";
  source: string;
  by: StaffKey;
  createdAt: Date;
  notes?: string;
  quote?: string;
  checkedInAt?: Date;
  checkedOutAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  charges?: { designation: string; quantity: number; unitPrice: number; day: number; by: StaffKey }[];
  payments?: Payment[];
};

const RESERVATIONS: ReservationDef[] = [
  {
    key: "traore",
    guest: "traore",
    rooms: [["103", 2]],
    from: -12,
    to: -8,
    plan: "PETIT_DEJEUNER",
    status: "TERMINEE",
    source: "TELEPHONE",
    by: "mariam",
    createdAt: at(-30, 10),
    checkedInAt: at(-12, 15, 10),
    checkedOutAt: at(-8, 11, 20),
    payments: [
      { share: 0.3, method: "MOBILE_MONEY", by: "mariam", at: at(-30, 10, 5), reference: "OM-784512" },
      { rest: true, method: "CARTE", by: "koffi", at: at(-8, 11, 5) },
    ],
  },
  {
    key: "bamba",
    guest: "bamba",
    rooms: [["402", 2, 1]],
    from: -9,
    to: -6,
    plan: "DEMI_PENSION",
    status: "TERMINEE",
    source: "SITE",
    by: "koffi",
    createdAt: at(-20, 18, 30),
    checkedInAt: at(-9, 14, 40),
    checkedOutAt: at(-6, 10, 50),
    charges: [{ designation: "Soin au spa", quantity: 2, unitPrice: 45_000, day: -8, by: "koffi" }],
    payments: [
      { amount: 1_000_000, method: "VIREMENT", by: "koffi", at: at(-6, 10, 30), reference: "VIR-SGCI-22871", cancel: { by: "aicha", at: at(-6, 10, 40), reason: "Doublon de saisie" } },
      { rest: true, method: "VIREMENT", by: "koffi", at: at(-6, 10, 35), reference: "VIR-SGCI-22871" },
    ],
  },
  {
    key: "ndri",
    guest: "ndri",
    rooms: [["104", 1]],
    from: 2,
    to: 4,
    plan: "CHAMBRE_SEULE",
    status: "ANNULEE",
    source: "TELEPHONE",
    by: "serge",
    createdAt: at(-10, 22, 15),
    cancelledAt: at(-3, 9, 30),
    cancelReason: "Changement de programme du client",
    payments: [{ share: 0.3, method: "ESPECES", by: "serge", at: at(-10, 22, 20) }],
  },
  {
    key: "kouadio",
    guest: "kouadio",
    rooms: [["501", 2]],
    from: -2,
    to: 2,
    plan: "DEMI_PENSION",
    status: "EN_SEJOUR",
    source: "DIRECT",
    by: "koffi",
    createdAt: at(-21, 11),
    notes: "Arrivée par vol AF702. Accueil par le directeur.",
    checkedInAt: at(-2, 16, 5),
    charges: [
      { designation: "Transfert aéroport", quantity: 1, unitPrice: 35_000, day: -2, by: "koffi" },
      { designation: "Soin au spa", quantity: 2, unitPrice: 45_000, day: -1, by: "mariam" },
    ],
    payments: [{ share: 0.5, method: "VIREMENT", by: "koffi", at: at(-21, 11, 30), reference: "VIR-KH-0915" }],
  },
  {
    key: "durand",
    guest: "durand",
    rooms: [
      ["201", 2],
      ["202", 1, 1],
    ],
    from: -1,
    to: 3,
    plan: "PETIT_DEJEUNER",
    status: "EN_SEJOUR",
    source: "EMAIL",
    by: "mariam",
    createdAt: at(-15, 9, 45),
    checkedInAt: at(-1, 15, 30),
    payments: [{ share: 0.3, method: "CARTE", by: "mariam", at: at(-15, 9, 50) }],
  },
  {
    key: "weber",
    guest: "weber",
    rooms: [["301", 1]],
    from: -3,
    to: 0,
    plan: "CHAMBRE_SEULE",
    status: "EN_SEJOUR",
    source: "AGENCE",
    by: "serge",
    createdAt: at(-18, 23),
    checkedInAt: at(-3, 19, 45),
    charges: [{ designation: "Blanchisserie", quantity: 1, unitPrice: 15_000, day: -1, by: "mariam" }],
    payments: [{ amount: 350_000, method: "CARTE", by: "serge", at: at(-3, 19, 50) }],
  },
  {
    key: "kouassi",
    guest: "kouassi",
    rooms: [["105", 1]],
    from: -2,
    to: 0,
    plan: "PETIT_DEJEUNER",
    status: "EN_SEJOUR",
    source: "DIRECT",
    by: "koffi",
    createdAt: at(-2, 13),
    checkedInAt: at(-2, 14, 20),
    payments: [{ rest: true, method: "MOBILE_MONEY", by: "mariam", at: at(0, 9, 15), reference: "WAVE-55120" }],
  },
  {
    key: "aka",
    guest: "aka",
    rooms: [["303", 2]],
    from: -1,
    to: 1,
    plan: "CHAMBRE_SEULE",
    status: "EN_SEJOUR",
    source: "TELEPHONE",
    by: "serge",
    createdAt: at(-4, 20),
    checkedInAt: at(-1, 21, 10),
  },
  {
    key: "martin",
    guest: "martin",
    rooms: [["206", 2]],
    from: -4,
    to: 1,
    plan: "PETIT_DEJEUNER",
    status: "EN_SEJOUR",
    source: "SITE",
    by: "mariam",
    createdAt: at(-40, 12),
    checkedInAt: at(-4, 15),
    payments: [{ rest: true, method: "CARTE", by: "mariam", at: at(-40, 12, 10) }],
  },
  {
    key: "diarra",
    guest: "diarra",
    rooms: [["107", 1]],
    from: -1,
    to: 2,
    plan: "CHAMBRE_SEULE",
    status: "EN_SEJOUR",
    source: "DIRECT",
    by: "koffi",
    createdAt: at(-1, 12, 30),
    checkedInAt: at(-1, 12, 45),
    payments: [{ amount: 200_000, method: "ESPECES", by: "koffi", at: at(-1, 12, 50) }],
  },
  {
    key: "sow",
    guest: "sow",
    rooms: [
      ["101", 2],
      ["102", 2],
    ],
    from: 0,
    to: 4,
    checkInTime: "15:00",
    plan: "PETIT_DEJEUNER",
    status: "CONFIRMEE",
    source: "EMAIL",
    by: "mariam",
    createdAt: at(-7, 10, 15),
    notes: "Délégation Teranga Events : arrivée prévue vers 15 h.",
    payments: [{ share: 0.3, method: "MOBILE_MONEY", by: "mariam", at: at(-7, 10, 20), reference: "OM-993321" }],
  },
  {
    key: "mensah",
    guest: "mensah",
    rooms: [["401", 2]],
    from: 0,
    to: 2,
    checkInTime: "21:30",
    checkOutTime: "11:00",
    plan: "CHAMBRE_SEULE",
    status: "CONFIRMEE",
    source: "TELEPHONE",
    by: "koffi",
    createdAt: at(-2, 17),
  },
  {
    key: "benali",
    guest: "benali",
    rooms: [["302", 2]],
    from: 3,
    to: 7,
    plan: "DEMI_PENSION",
    status: "CONFIRMEE",
    source: "SITE",
    by: "mariam",
    createdAt: at(-5, 14),
    payments: [{ share: 0.3, method: "CARTE", by: "mariam", at: at(-5, 14, 5) }],
  },
  {
    key: "okafor",
    guest: "okafor",
    rooms: [
      ["203", 1],
      ["204", 1],
      ["205", 1],
    ],
    from: 5,
    to: 8,
    plan: "PENSION_COMPLETE",
    status: "CONFIRMEE",
    source: "DEVIS",
    by: "koffi",
    createdAt: at(-6, 11, 10),
    quote: "okafor",
    notes: "Issue du devis. Séminaire Okafor Energy : salle Ébène réservée.",
    payments: [{ share: 0.5, method: "VIREMENT", by: "koffi", at: at(-4, 9, 30), reference: "VIR-OE-7781" }],
  },
  {
    key: "lambert",
    guest: "lambert",
    rooms: [["501", 2]],
    from: 10,
    to: 14,
    plan: "PETIT_DEJEUNER",
    status: "CONFIRMEE",
    source: "EMAIL",
    by: "aicha",
    createdAt: at(-3, 10),
  },
];

// ----- Additions du restaurant -----

type OrderDef = {
  table: string;
  covers: number;
  status: "OUVERTE" | "IMPUTEE" | "REGLEE";
  reservation?: string;
  guestName?: string;
  by: StaffKey;
  createdAt: Date;
  closedAt?: Date;
  items: [name: string, quantity: number][];
  payment?: { method: string; by: StaffKey; payerName: string; reference?: string };
};

const ORDERS: OrderDef[] = [
  {
    table: "Table 3",
    covers: 2,
    status: "IMPUTEE",
    reservation: "kouadio",
    by: "mariam",
    createdAt: at(-1, 20, 30),
    closedAt: at(-1, 22, 40),
    items: [
      ["Champagne brut (bouteille)", 1],
      ["Homard grillé au beurre citronné", 2],
      ["Moelleux au chocolat, cœur coulant", 2],
    ],
  },
  {
    table: "Table 6",
    covers: 2,
    status: "REGLEE",
    guestName: "M. et Mme Diallo",
    by: "serge",
    createdAt: at(-1, 20, 15),
    closedAt: at(-1, 22, 5),
    items: [
      ["Carpaccio de capitaine aux agrumes", 2],
      ["Filet de bœuf sauce poivre, gratin dauphinois", 2],
      ["Bordeaux rouge (bouteille)", 1],
    ],
    payment: { method: "CARTE", by: "serge", payerName: "M. et Mme Diallo" },
  },
  {
    table: "Room service",
    covers: 3,
    status: "OUVERTE",
    reservation: "durand",
    by: "koffi",
    createdAt: at(0, 12, 50),
    items: [
      ["Risotto crémeux aux cèpes", 1],
      ["Poulet kedjenou revisité", 2],
      ["Jus de bissap frais", 3],
    ],
  },
  {
    table: "Table 2",
    covers: 4,
    status: "OUVERTE",
    guestName: "Déjeuner d'affaires — Ivoire Conseil",
    by: "mariam",
    createdAt: at(0, 12, 30),
    items: [
      ["Tartare de thon rouge, mangue et piment doux", 2],
      ["Capitaine braisé, attiéké et sauce claire", 4],
      ["Eau minérale (75 cl)", 4],
    ],
  },
  {
    table: "Bar",
    covers: 2,
    status: "REGLEE",
    guestName: "Client de passage",
    by: "koffi",
    createdAt: at(0, 11, 0),
    closedAt: at(0, 11, 45),
    items: [["Cocktail signature Ébène", 2]],
    payment: { method: "ESPECES", by: "koffi", payerName: "Client de passage — Bar" },
  },
];

function roundThousand(value: number) {
  return Math.round(value / 1000) * 1000;
}

async function main() {
  console.log("→ Nettoyage de la base");
  await db.receipt.deleteMany();
  await db.orderLine.deleteMany();
  await db.restaurantOrder.deleteMany();
  await db.charge.deleteMany();
  await db.reservationRoom.deleteMany();
  await db.reservation.deleteMany();
  await db.quoteExtra.deleteMany();
  await db.quoteRoom.deleteMany();
  await db.quote.deleteMany();
  await db.menuItem.deleteMany();
  await db.room.deleteMany();
  await db.roomType.deleteMany();
  await db.guest.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.counter.deleteMany();
  await db.hotel.deleteMany();

  console.log("→ Hôtel, équipe, chambres, carte");
  await db.hotel.create({ data: HOTEL });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const users = {} as Record<StaffKey, string>;
  for (const [key, u] of Object.entries(STAFF) as [StaffKey, (typeof STAFF)[StaffKey]][]) {
    const created = await db.user.create({ data: { ...u, passwordHash, lastLoginAt: at(0, 8, 0) } });
    users[key] = created.id;
  }

  const types = {} as Record<string, { id: string; name: string; basePrice: number }>;
  const rooms = {} as Record<string, { id: string; basePrice: number }>;
  for (const [i, t] of ROOM_TYPES.entries()) {
    const type = await db.roomType.create({
      data: {
        name: t.name,
        capacity: t.capacity,
        basePrice: t.basePrice,
        size: t.size,
        bed: t.bed,
        description: t.description,
        amenities: t.amenities,
        sortOrder: i,
      },
    });
    types[t.key] = { id: type.id, name: type.name, basePrice: type.basePrice };
    for (const number of t.rooms) {
      const outOfService = number === "106";
      const room = await db.room.create({
        data: {
          number,
          floor: t.floor,
          roomTypeId: type.id,
          outOfService,
          notes: outOfService ? "Climatisation en révision" : null,
        },
      });
      rooms[number] = { id: room.id, basePrice: type.basePrice };
    }
  }

  const menu = {} as Record<string, number>;
  const menuIds = {} as Record<string, string>;
  for (const [i, [category, name, price, description]] of MENU.entries()) {
    const item = await db.menuItem.create({ data: { category, name, price, description: description ?? null, sortOrder: i } });
    menu[name] = price;
    menuIds[name] = item.id;
  }

  const guests = {} as Record<GuestKey, { id: string; name: string }>;
  for (const [key, g] of Object.entries(GUESTS) as [GuestKey, (typeof GUESTS)[GuestKey]][]) {
    const created = await db.guest.create({ data: { ...g, createdAt: at(-60, 9) } });
    guests[key] = { id: created.id, name: `${g.firstName} ${g.lastName}` };
  }

  console.log("→ Devis");
  const quoteIds = {} as Record<string, string>;
  for (const q of [...QUOTES].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const planPrice = mealPlanPrice(q.plan, HOTEL);
    const roomRows = q.rooms.map((r, position) => ({
      roomTypeId: types[r.type].id,
      position,
      quantity: r.quantity,
      adults: r.adults,
      children: r.children ?? 0,
      nightlyRate: types[r.type].basePrice,
    }));
    const extras = (q.extras ?? []).map((e, position) => ({ ...e, position, total: lineAmount(e.quantity, e.unitPrice) }));
    const totals = stayTotals({
      nights: q.to - q.from,
      rooms: roomRows,
      mealPlanPrice: planPrice,
      extras: extras.reduce((s, e) => s + e.total, 0),
      vatRate: HOTEL.vatRate,
      cityTax: HOTEL.cityTax,
    });
    const created = await db.quote.create({
      data: {
        number: nextNumber("DEV"),
        guestId: guests[q.guest].id,
        status: q.status,
        issueDate: day(q.issue),
        validUntil: day(q.issue + q.validity),
        checkIn: day(q.from),
        checkOut: day(q.to),
        mealPlan: q.plan,
        mealPlanPrice: planPrice,
        cityTax: HOTEL.cityTax,
        vatRate: HOTEL.vatRate,
        currency: HOTEL.currency,
        notes: HOTEL.quoteTerms,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        cityTaxAmount: totals.cityTaxAmount,
        total: totals.total,
        createdById: users[q.by],
        createdAt: q.createdAt,
        rooms: { create: roomRows },
        extras: { create: extras },
      },
    });
    quoteIds[q.key] = created.id;
  }

  console.log("→ Réservations");
  const reservations = {} as Record<string, { id: string; number: string; def: ReservationDef; total: number }>;
  for (const r of [...RESERVATIONS].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const quote = r.quote ? QUOTES.find((q) => q.key === r.quote) : undefined;
    const charges = [
      ...(r.charges ?? []),
      ...(quote?.extras ?? []).map((e) => ({ ...e, day: r.from, by: r.by })),
    ];
    const created = await db.reservation.create({
      data: {
        number: nextNumber("RES"),
        guestId: guests[r.guest].id,
        status: r.status,
        checkIn: day(r.from),
        checkOut: day(r.to),
        checkInTime: r.checkInTime ?? HOTEL.checkInTime,
        checkOutTime: r.checkOutTime ?? HOTEL.checkOutTime,
        mealPlan: r.plan,
        mealPlanPrice: mealPlanPrice(r.plan, HOTEL),
        cityTax: HOTEL.cityTax,
        vatRate: HOTEL.vatRate,
        currency: HOTEL.currency,
        source: r.source,
        notes: r.notes ?? null,
        quoteId: r.quote ? quoteIds[r.quote] : null,
        checkedInAt: r.checkedInAt ?? null,
        checkedOutAt: r.checkedOutAt ?? null,
        cancelledAt: r.cancelledAt ?? null,
        cancelReason: r.cancelReason ?? null,
        createdById: users[r.by],
        createdAt: r.createdAt,
        rooms: {
          create: r.rooms.map(([number, adults, children = 0]) => ({
            roomId: rooms[number].id,
            adults,
            children,
            nightlyRate: rooms[number].basePrice,
          })),
        },
        charges: {
          create: charges.map((c) => ({
            date: day(c.day),
            designation: c.designation,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            total: lineAmount(c.quantity, c.unitPrice),
            createdById: users[c.by],
            createdAt: at(c.day, 18),
          })),
        },
      },
    });
    reservations[r.key] = { id: created.id, number: created.number, def: r, total: 0 };
  }

  console.log("→ Additions du restaurant");
  type PendingReceipt = {
    reservationId?: string;
    orderId?: string;
    payerName: string;
    label: string;
    amount: number;
    method: string;
    reference: string | null;
    balanceAfter: number | null;
    paidAt: Date;
    createdById: string;
    cancel?: Payment["cancel"];
  };
  const pending: PendingReceipt[] = [];
  const restaurantByReservation = {} as Record<string, number>;

  for (const o of [...ORDERS].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const lines = o.items.map(([name, quantity]) => ({
      menuItemId: menuIds[name],
      name,
      quantity,
      unitPrice: menu[name],
      total: lineAmount(quantity, menu[name]),
    }));
    const totals = orderTotals(lines, HOTEL.vatRate);
    const reservation = o.reservation ? reservations[o.reservation] : undefined;
    const created = await db.restaurantOrder.create({
      data: {
        number: nextNumber("CMD"),
        status: o.status,
        tableLabel: o.table,
        covers: o.covers,
        reservationId: reservation?.id ?? null,
        guestName: o.guestName ?? null,
        vatRate: HOTEL.vatRate,
        ...totals,
        createdById: users[o.by],
        createdAt: o.createdAt,
        closedAt: o.closedAt ?? null,
        lines: { create: lines },
      },
    });
    if (o.status === "IMPUTEE" && o.reservation) {
      restaurantByReservation[o.reservation] = (restaurantByReservation[o.reservation] ?? 0) + totals.subtotal;
    }
    if (o.payment) {
      pending.push({
        orderId: created.id,
        payerName: o.payment.payerName,
        label: `Addition ${created.number} — ${o.table}`,
        amount: totals.total,
        method: o.payment.method,
        reference: o.payment.reference ?? null,
        balanceAfter: null,
        paidAt: o.closedAt ?? o.createdAt,
        createdById: users[o.payment.by],
      });
    }
  }

  console.log("→ Encaissements");
  for (const [key, res] of Object.entries(reservations)) {
    const r = res.def;
    const nights = nightsBetween(day(r.from), day(r.to));
    const quote = r.quote ? QUOTES.find((q) => q.key === r.quote) : undefined;
    const extras = [...(r.charges ?? []), ...(quote?.extras ?? [])].reduce((s, c) => s + lineAmount(c.quantity, c.unitPrice), 0);
    const totals = stayTotals({
      nights,
      rooms: r.rooms.map(([number, adults, children = 0]) => ({ adults, children, nightlyRate: rooms[number].basePrice })),
      mealPlanPrice: mealPlanPrice(r.plan, HOTEL),
      extras,
      restaurant: restaurantByReservation[key] ?? 0,
      vatRate: HOTEL.vatRate,
      cityTax: HOTEL.cityTax,
    });
    res.total = totals.total;

    let paid = 0;
    for (const p of [...(r.payments ?? [])].sort((a, b) => a.at.getTime() - b.at.getTime())) {
      const balance = totals.total - paid;
      const amount = p.rest ? balance : p.share ? roundThousand(totals.total * p.share) : (p.amount ?? 0);
      const beforeArrival = p.at < day(r.from);
      const full = amount === balance;
      const label = beforeArrival
        ? full
          ? `Prépaiement du séjour — réservation ${res.number}`
          : `Acompte — réservation ${res.number}`
        : full
          ? `Solde du séjour — ${res.number}`
          : `Règlement partiel — séjour ${res.number}`;
      pending.push({
        reservationId: res.id,
        payerName: guests[r.guest].name,
        label,
        amount,
        method: p.method,
        reference: p.reference ?? null,
        balanceAfter: balance - amount,
        paidAt: p.at,
        createdById: users[p.by],
        cancel: p.cancel,
      });
      if (!p.cancel) paid += amount;
    }
  }

  for (const receipt of pending.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())) {
    const { cancel, ...data } = receipt;
    await db.receipt.create({
      data: {
        ...data,
        number: nextNumber("REC"),
        currency: HOTEL.currency,
        createdAt: data.paidAt,
        cancelledAt: cancel?.at ?? null,
        cancelledById: cancel ? users[cancel.by] : null,
        cancelReason: cancel?.reason ?? null,
      },
    });
  }

  for (const [prefix, value] of Object.entries(counters)) {
    await db.counter.create({ data: { key: `${prefix}-${YEAR}`, value } });
  }

  console.log(
    `✔ ${Object.keys(rooms).length} chambres, ${RESERVATIONS.length} réservations, ${QUOTES.length} devis, ${pending.length} reçus, ${ORDERS.length} additions`,
  );
  console.log("  Comptes : direction@suitehotel.ci, koffi.brou@suitehotel.ci, mariam.kone@suitehotel.ci… — mot de passe demo1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
