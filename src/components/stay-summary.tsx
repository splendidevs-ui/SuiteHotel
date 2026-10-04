import type { ReactNode } from "react";
import { plural } from "@/lib/format";
import { formatMoney, formatQuantity } from "@/lib/money";
import { amountInWords } from "@/lib/number-words";
import type { StayTotals } from "@/lib/stay-math";

/** Recapitulatif des montants d'un sejour (formulaires de reservation et de devis). */
export function StaySummary({
  totals,
  currency,
  vatRate,
  mealLabel,
  footer,
}: {
  totals: StayTotals;
  currency: string;
  vatRate: number;
  mealLabel: string;
  footer?: ReactNode;
}) {
  const row = (label: string, amount: number, muted = true) => (
    <div className="flex justify-between gap-3">
      <dt className={muted ? "text-muted" : "font-medium"}>{label}</dt>
      <dd className={muted ? "" : "font-semibold"}>{formatMoney(amount, currency)}</dd>
    </div>
  );
  return (
    <section className="card overflow-hidden">
      <div className="bg-ink-950 px-5 py-4 text-white">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gold-400">Récapitulatif</p>
        <p className="mt-1 text-sm text-ink-300">
          {plural(totals.nights, "nuit")} · {plural(totals.roomCount, "chambre")} · {plural(totals.persons, "personne")}
        </p>
      </div>
      <dl className="tabular space-y-2 px-5 py-4 text-sm">
        {row("Hébergement", totals.accommodation)}
        {totals.meals > 0 && row(`Formule ${mealLabel.toLowerCase()}`, totals.meals)}
        {totals.extras > 0 && row("Prestations", totals.extras)}
        {totals.restaurant > 0 && row("Restaurant", totals.restaurant)}
        <div className="border-t pt-2">{row("Total HT", totals.subtotal, false)}</div>
        {row(`TVA (${formatQuantity(vatRate)} %)`, totals.vatAmount)}
        {totals.cityTaxAmount > 0 && row("Taxe de séjour", totals.cityTaxAmount)}
        <div className="flex items-baseline justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">Total TTC</dt>
          <dd className="accent text-xl font-bold">{formatMoney(totals.total, currency)}</dd>
        </div>
      </dl>
      <p className="px-5 pb-4 text-xs italic text-muted">{amountInWords(totals.total, currency)}</p>
      {footer}
    </section>
  );
}
