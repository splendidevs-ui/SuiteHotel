// Valeurs contraintes cote application (le schema stocke des String).

/** Partage par proxy.ts (sans acces base) et lib/auth.ts. */
export const SESSION_COOKIE = "suitehotel_session";

type Meta = { label: string; className: string; dot: string };

const TONES = {
  gold: "bg-gold-100 text-gold-800 dark:bg-gold-500/15 dark:text-gold-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  slate: "bg-ink-200 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
};

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

// ----- Personnel -----

export const ROLES = ["DIRECTION", "RECEPTION"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { label: string; className: string }> = {
  DIRECTION: { label: "Direction", className: TONES.gold },
  RECEPTION: { label: "Réception", className: TONES.slate },
};

export const isRole = (value: string): value is Role => isOneOf(ROLES, value);

// ----- Reservations -----

export const RESERVATION_STATUSES = ["CONFIRMEE", "EN_SEJOUR", "TERMINEE", "ANNULEE"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_META: Record<ReservationStatus, Meta & { bar: string }> = {
  CONFIRMEE: {
    label: "Confirmée",
    className: TONES.sky,
    dot: "bg-sky-500",
    bar: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-500/40",
  },
  EN_SEJOUR: {
    label: "En séjour",
    className: TONES.emerald,
    dot: "bg-emerald-500",
    bar: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-500/40",
  },
  TERMINEE: {
    label: "Terminée",
    className: TONES.slate,
    dot: "bg-ink-400",
    bar: "bg-ink-100 text-ink-600 border-ink-300 dark:bg-ink-800 dark:text-ink-300 dark:border-ink-700",
  },
  ANNULEE: {
    label: "Annulée",
    className: TONES.rose,
    dot: "bg-rose-500",
    bar: "bg-rose-50 text-rose-800 border-rose-200",
  },
};

/** Statuts qui bloquent une chambre sur leurs dates. */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ["CONFIRMEE", "EN_SEJOUR"];

export const isReservationStatus = (value: string): value is ReservationStatus =>
  isOneOf(RESERVATION_STATUSES, value);

export const RESERVATION_SOURCES = ["DIRECT", "TELEPHONE", "EMAIL", "SITE", "AGENCE", "DEVIS"] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const SOURCE_LABELS: Record<ReservationSource, string> = {
  DIRECT: "Comptoir",
  TELEPHONE: "Téléphone",
  EMAIL: "E-mail",
  SITE: "Site web",
  AGENCE: "Agence / plateforme",
  DEVIS: "Devis accepté",
};

// ----- Formules de restauration (proposees si le module restauration est actif) -----

export const MEAL_PLANS = ["CHAMBRE_SEULE", "PETIT_DEJEUNER", "DEMI_PENSION", "PENSION_COMPLETE"] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

export const MEAL_PLAN_META: Record<MealPlan, { label: string; description: string }> = {
  CHAMBRE_SEULE: { label: "Chambre seule", description: "Hébergement uniquement" },
  PETIT_DEJEUNER: { label: "Petit-déjeuner", description: "Petit-déjeuner inclus" },
  DEMI_PENSION: { label: "Demi-pension", description: "Petit-déjeuner et dîner" },
  PENSION_COMPLETE: { label: "Pension complète", description: "Petit-déjeuner, déjeuner et dîner" },
};

export const isMealPlan = (value: string): value is MealPlan => isOneOf(MEAL_PLANS, value);

export function mealPlanLabel(plan: string) {
  return isMealPlan(plan) ? MEAL_PLAN_META[plan].label : plan;
}

export const isReservationSource = (value: string): value is ReservationSource => isOneOf(RESERVATION_SOURCES, value);

export type MealPrices = { breakfastPrice: number; halfBoardPrice: number; fullBoardPrice: number };

/** Prix de chaque formule (par personne et par nuit, HT) selon la fiche de l'hotel. */
export function mealPriceTable(hotel: MealPrices): Record<MealPlan, number> {
  return {
    CHAMBRE_SEULE: 0,
    PETIT_DEJEUNER: hotel.breakfastPrice,
    DEMI_PENSION: hotel.halfBoardPrice,
    PENSION_COMPLETE: hotel.fullBoardPrice,
  };
}

/** Formules proposees : "Chambre seule", plus celles qui ont un prix si la restauration est active. */
export function offeredMealPlans(restaurantEnabled: boolean, prices: Record<MealPlan, number>, keep?: MealPlan): MealPlan[] {
  return MEAL_PLANS.filter((p) => p === "CHAMBRE_SEULE" || p === keep || (restaurantEnabled && prices[p] > 0));
}

/** Prix d'une formule, par personne et par nuit (HT). */
export function mealPlanPrice(plan: string, hotel: MealPrices) {
  switch (plan) {
    case "PETIT_DEJEUNER":
      return hotel.breakfastPrice;
    case "DEMI_PENSION":
      return hotel.halfBoardPrice;
    case "PENSION_COMPLETE":
      return hotel.fullBoardPrice;
    default:
      return 0;
  }
}

// ----- Devis -----

export const QUOTE_STATUSES = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** "EXPIRE" n'est jamais stocke : c'est un devis envoye dont la validite est depassee. */
export type DisplayQuoteStatus = QuoteStatus | "EXPIRE";

export const QUOTE_STATUS_META: Record<DisplayQuoteStatus, Meta> = {
  BROUILLON: { label: "Brouillon", className: TONES.slate, dot: "bg-ink-400" },
  ENVOYE: { label: "Envoyé", className: TONES.sky, dot: "bg-sky-500" },
  EXPIRE: { label: "Expiré", className: TONES.amber, dot: "bg-amber-500" },
  ACCEPTE: { label: "Accepté", className: TONES.emerald, dot: "bg-emerald-500" },
  REFUSE: { label: "Refusé", className: TONES.rose, dot: "bg-rose-500" },
};

export const QUOTE_FILTERS: DisplayQuoteStatus[] = ["BROUILLON", "ENVOYE", "EXPIRE", "ACCEPTE", "REFUSE"];

export const isQuoteStatus = (value: string): value is QuoteStatus => isOneOf(QUOTE_STATUSES, value);

export function displayQuoteStatus(quote: { status: string; validUntil: Date }, today: Date): DisplayQuoteStatus {
  const status = isQuoteStatus(quote.status) ? quote.status : "BROUILLON";
  if (status === "ENVOYE" && new Date(quote.validUntil) < today) return "EXPIRE";
  return status;
}

/** Un devis accepte ou refuse est clos : il faut le rouvrir pour le modifier. */
export function isQuoteEditable(status: string) {
  return status === "BROUILLON" || status === "ENVOYE";
}

export type TransitionTone = "primary" | "success" | "danger" | "neutral";

export const QUOTE_TRANSITIONS: Record<QuoteStatus, { to: QuoteStatus; label: string; tone: TransitionTone }[]> = {
  BROUILLON: [
    { to: "ENVOYE", label: "Marquer comme envoyé", tone: "primary" },
    { to: "REFUSE", label: "Refusé par le client", tone: "danger" },
  ],
  ENVOYE: [
    { to: "ACCEPTE", label: "Accepté (sans réserver)", tone: "success" },
    { to: "REFUSE", label: "Refusé par le client", tone: "danger" },
    { to: "BROUILLON", label: "Repasser en brouillon", tone: "neutral" },
  ],
  ACCEPTE: [{ to: "ENVOYE", label: "Rouvrir le devis", tone: "neutral" }],
  REFUSE: [{ to: "ENVOYE", label: "Rouvrir le devis", tone: "neutral" }],
};

// ----- Recus -----

export const PAYMENT_METHODS = ["ESPECES", "CARTE", "MOBILE_MONEY", "VIREMENT", "CHEQUE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ESPECES: "Espèces",
  CARTE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
};

export const isPaymentMethod = (value: string): value is PaymentMethod => isOneOf(PAYMENT_METHODS, value);

export function paymentMethodLabel(value: string) {
  return isPaymentMethod(value) ? PAYMENT_METHOD_LABELS[value] : value;
}

// ----- Restaurant -----

export const ORDER_STATUSES = ["OUVERTE", "IMPUTEE", "REGLEE", "ANNULEE"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_META: Record<OrderStatus, Meta> = {
  OUVERTE: { label: "En cours", className: TONES.amber, dot: "bg-amber-500" },
  IMPUTEE: { label: "Sur la note", className: TONES.violet, dot: "bg-violet-500" },
  REGLEE: { label: "Réglée", className: TONES.emerald, dot: "bg-emerald-500" },
  ANNULEE: { label: "Annulée", className: TONES.rose, dot: "bg-rose-500" },
};

export const isOrderStatus = (value: string): value is OrderStatus => isOneOf(ORDER_STATUSES, value);

export const MENU_CATEGORIES = ["PETIT_DEJEUNER", "ENTREE", "PLAT", "DESSERT", "BOISSON", "VIN"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  PETIT_DEJEUNER: "Petit-déjeuner",
  ENTREE: "Entrées",
  PLAT: "Plats",
  DESSERT: "Desserts",
  BOISSON: "Boissons",
  VIN: "Vins & champagnes",
};

export const isMenuCategory = (value: string): value is MenuCategory => isOneOf(MENU_CATEGORIES, value);

// ----- Saisie -----

export const ID_TYPES = ["Passeport", "Carte nationale d'identité", "Carte de séjour", "Permis de conduire"];

export const EXTRA_SUGGESTIONS = [
  "Transfert aéroport",
  "Soin au spa",
  "Blanchisserie",
  "Minibar",
  "Late check-out",
  "Décoration florale",
  "Dîner privé",
  "Location de salle de séminaire",
];

// ----- Etat des chambres, aujourd'hui (derive des reservations) -----

export const ROOM_STATES = ["LIBRE", "ARRIVEE", "OCCUPEE", "DEPART", "HS"] as const;
export type RoomState = (typeof ROOM_STATES)[number];

export const ROOM_STATE_META: Record<RoomState, Meta> = {
  LIBRE: { label: "Libre", className: TONES.emerald, dot: "bg-emerald-500" },
  ARRIVEE: { label: "Arrivée prévue", className: TONES.sky, dot: "bg-sky-500" },
  OCCUPEE: { label: "Occupée", className: TONES.gold, dot: "bg-gold-500" },
  DEPART: { label: "Départ prévu", className: TONES.amber, dot: "bg-amber-500" },
  HS: { label: "Hors service", className: TONES.rose, dot: "bg-rose-500" },
};
