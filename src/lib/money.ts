/** Devises sans sous-unite : le montant stocke est deja l'unite entiere. */
const ZERO_DECIMAL = new Set(["XOF", "XAF", "GNF", "CDF", "JPY", "KMF", "RWF", "UGX"]);

export const SUPPORTED_CURRENCIES = [
  { code: "XOF", label: "Franc CFA (BCEAO)", symbol: "FCFA" },
  { code: "XAF", label: "Franc CFA (BEAC)", symbol: "FCFA" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "Dollar US", symbol: "$" },
  { code: "MAD", label: "Dirham marocain", symbol: "MAD" },
  { code: "GNF", label: "Franc guinéen", symbol: "GNF" },
] as const;

export function isZeroDecimal(currency: string) {
  return ZERO_DECIMAL.has(currency.toUpperCase());
}

/** Convertit un montant stocke en nombre affichable. */
export function toDisplayAmount(amount: number, currency: string) {
  return isZeroDecimal(currency) ? amount : amount / 100;
}

/** Convertit une saisie utilisateur en montant stocke. */
export function toStoredAmount(input: number, currency: string) {
  return isZeroDecimal(currency) ? Math.round(input) : Math.round(input * 100);
}

export function currencySymbol(currency: string) {
  return SUPPORTED_CURRENCIES.find((c) => c.code === currency.toUpperCase())?.symbol ?? currency;
}

/** Nombre au format francais, sans symbole : "1 250 000" ou "12,50". */
export function formatAmount(amount: number, currency = "XOF") {
  const decimals = isZeroDecimal(currency) ? 0 : 2;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toDisplayAmount(amount, currency));
}

export function formatMoney(amount: number, currency = "XOF") {
  return `${formatAmount(amount, currency)} ${currencySymbol(currency)}`;
}

/** Quantite affichee sans decimales inutiles : 2 -> "2", 2.5 -> "2,5". */
export function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(quantity);
}

/** Valeur d'un champ de saisie (unite affichee) a partir d'un montant stocke. */
export function toInputAmount(amount: number, currency: string) {
  return String(toDisplayAmount(amount, currency));
}
