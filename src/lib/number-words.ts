import { isZeroDecimal } from "./money";

/**
 * Montant en toutes lettres, pour les mentions "Arrete le present devis a la somme de…"
 * et "Recu la somme de…". Orthographe traditionnelle : "vingt et un", "quatre-vingts",
 * "deux cents", mais "deux cent mille" / "quatre-vingt mille" (mille est invariable et
 * n'entraine pas le pluriel), et "deux cents millions" (million est un nom).
 */

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** `plural` : vrai si le nombre termine l'expression ou precede million/milliard. */
function below100(n: number, plural: boolean): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens <= 6) {
    if (unit === 0) return TENS[tens];
    if (unit === 1) return `${TENS[tens]} et un`;
    return `${TENS[tens]}-${UNITS[unit]}`;
  }
  if (tens === 7) return unit === 1 ? "soixante et onze" : `soixante-${below100(10 + unit, plural)}`;
  if (tens === 8) {
    if (unit === 0) return plural ? "quatre-vingts" : "quatre-vingt";
    return `quatre-vingt-${UNITS[unit]}`;
  }
  return `quatre-vingt-${below100(10 + unit, plural)}`;
}

function below1000(n: number, plural: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const restWords = rest ? below100(rest, plural) : "";
  if (hundreds === 0) return restWords;
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 && plural ? "s" : ""}`;
  return restWords ? `${head} ${restWords}` : head;
}

function spell(n: number, plural: boolean): string {
  const parts: string[] = [];
  let rest = n;

  for (const [size, name] of [[1e9, "milliard"], [1e6, "million"]] as const) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(count === 1 ? `un ${name}` : `${spell(count, true)} ${name}s`);
      rest %= size;
    }
  }

  const thousands = Math.floor(rest / 1000);
  if (thousands) {
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
    rest %= 1000;
  }

  if (rest) parts.push(below1000(rest, plural));
  return parts.join(" ");
}

/** Nombre entier en lettres : 1250 -> "mille deux cent cinquante". */
export function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "zéro";
  const words = spell(n, true);
  return value < 0 ? `moins ${words}` : words;
}

const CURRENCY_WORDS: Record<string, { unit: [string, string]; sub?: [string, string] }> = {
  XOF: { unit: ["franc CFA", "francs CFA"] },
  XAF: { unit: ["franc CFA", "francs CFA"] },
  GNF: { unit: ["franc guinéen", "francs guinéens"] },
  EUR: { unit: ["euro", "euros"], sub: ["centime", "centimes"] },
  USD: { unit: ["dollar", "dollars"], sub: ["cent", "cents"] },
  MAD: { unit: ["dirham", "dirhams"], sub: ["centime", "centimes"] },
};

/** Montant stocke en lettres : 1200000 XOF -> "Un million deux cent mille francs CFA". */
export function amountInWords(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const meta = CURRENCY_WORDS[code] ?? { unit: [code, code] };
  const zeroDecimal = isZeroDecimal(code);
  const whole = zeroDecimal ? amount : Math.floor(amount / 100);
  const cents = zeroDecimal ? 0 : Math.round(amount % 100);

  const words = numberToWords(whole);
  const unit = whole > 1 ? meta.unit[1] : meta.unit[0];
  // "un million de francs", "deux milliards d'euros"
  const link = /(?:million|milliard)s?$/.test(words) ? (/^[aeiouy]/i.test(unit) ? "d'" : "de ") : "";

  let out = `${words} ${link}${unit}`;
  if (cents && meta.sub) {
    out += ` et ${numberToWords(cents)} ${cents > 1 ? meta.sub[1] : meta.sub[0]}`;
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}
