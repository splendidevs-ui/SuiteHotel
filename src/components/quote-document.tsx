import type { DocumentLine } from "@/lib/folio";
import { formatDate, guestName, plural } from "@/lib/format";
import type { Hotel } from "@/lib/hotel";
import { formatAmount, formatMoney, formatQuantity } from "@/lib/money";
import { amountInWords } from "@/lib/number-words";
import type { QuoteDetail } from "@/lib/queries";

/** Apercu du devis tel qu'il sera imprime (meme contenu que le PDF). */
export function QuoteDocument({
  hotel,
  quote,
  lines,
  nights,
  mealLabel,
  roomCount,
  persons,
}: {
  hotel: Hotel;
  quote: QuoteDetail;
  lines: DocumentLine[];
  nights: number;
  mealLabel: string;
  roomCount: number;
  persons: number;
}) {
  const cur = quote.currency;
  const g = quote.guest;
  return (
    <article className="paper p-6 text-[0.84rem] leading-relaxed sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-gold-600 pb-6">
        <div className="min-w-0">
          <p className="font-serif text-2xl font-semibold">{hotel.name}</p>
          {hotel.tagline && <p className="text-xs font-medium text-gold-700">{hotel.tagline}</p>}
          <div className="mt-2 text-xs text-ink-500">
            {hotel.address && <p className="whitespace-pre-line">{hotel.address}</p>}
            <p>{[hotel.city, hotel.country].filter(Boolean).join(", ")}</p>
            <p>{[hotel.phone && `Tél. ${hotel.phone}`, hotel.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-serif text-3xl font-semibold tracking-wide text-gold-700">DEVIS</p>
          <p className="mt-1 font-mono text-sm font-bold">{quote.number}</p>
          <p className="mt-2 text-xs text-ink-500">Émis le {formatDate(quote.issueDate)}</p>
          <p className="text-xs text-ink-500">Valable jusqu&apos;au {formatDate(quote.validUntil)}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-ink-200 bg-ink-50 p-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gold-700">Votre séjour</p>
          <p className="mt-1 font-semibold">
            {plural(nights, "nuit")} · {mealLabel}
          </p>
          <p className="text-xs text-ink-500">
            Arrivée le {formatDate(quote.checkIn, { weekday: "long" })}, à partir de {hotel.checkInTime}
          </p>
          <p className="text-xs text-ink-500">
            Départ le {formatDate(quote.checkOut, { weekday: "long" })}, avant {hotel.checkOutTime}
          </p>
          <p className="text-xs text-ink-500">
            {plural(roomCount, "chambre")} · {plural(persons, "personne")}
          </p>
        </div>
        <div className="rounded-md border border-ink-200 bg-ink-50 p-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gold-700">Client</p>
          <p className="mt-1 font-semibold">{guestName(g)}</p>
          {g.company && <p className="text-xs text-ink-500">{g.company}</p>}
          {g.address && <p className="whitespace-pre-line text-xs text-ink-500">{g.address}</p>}
          {g.phone && <p className="text-xs text-ink-500">Tél. {g.phone}</p>}
          {g.email && <p className="text-xs text-ink-500">{g.email}</p>}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-ink-900 text-[0.68rem] uppercase tracking-wide text-white">
              <th className="px-3 py-2 font-semibold">Désignation</th>
              <th className="px-3 py-2 text-right font-semibold">Qté</th>
              <th className="px-3 py-2 text-right font-semibold">P.U. HT</th>
              <th className="px-3 py-2 text-right font-semibold">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-ink-200 even:bg-ink-50">
                <td className="px-3 py-2.5">
                  <p className="font-semibold">{l.designation}</p>
                  {l.detail && <p className="text-xs text-ink-500">{l.detail}</p>}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">
                  {formatQuantity(l.quantity)}
                  {l.unit ? ` ${l.unit}` : ""}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{formatAmount(l.unitPrice, cur)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-semibold">{formatAmount(l.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <dl className="tabular w-full max-w-xs text-sm">
          <div className="flex justify-between border-b border-ink-200 py-1.5">
            <dt className="text-ink-500">Total HT</dt>
            <dd>{formatMoney(quote.subtotal, cur)}</dd>
          </div>
          <div className="flex justify-between border-b border-ink-200 py-1.5">
            <dt className="text-ink-500">TVA ({formatQuantity(quote.vatRate)} %)</dt>
            <dd>{formatMoney(quote.vatAmount, cur)}</dd>
          </div>
          {quote.cityTaxAmount > 0 && (
            <div className="flex justify-between border-b border-ink-200 py-1.5">
              <dt className="text-ink-500">Taxe de séjour</dt>
              <dd>{formatMoney(quote.cityTaxAmount, cur)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between bg-gold-700 px-3 py-2 font-bold text-white">
            <dt>Total TTC</dt>
            <dd>{formatMoney(quote.total, cur)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 text-xs text-ink-500">Arrêté le présent devis à la somme de :</p>
      <p className="font-semibold">{amountInWords(quote.total, cur)} TTC.</p>

      {quote.notes && (
        <div className="mt-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">Conditions</p>
          <p className="mt-1 whitespace-pre-line text-xs">{quote.notes}</p>
        </div>
      )}
      {hotel.bankDetails && (
        <div className="mt-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">Coordonnées bancaires</p>
          <p className="mt-1 whitespace-pre-line text-xs">{hotel.bankDetails}</p>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="h-24 rounded-md border border-ink-200 p-3 text-xs">
          <p className="font-semibold">Pour {hotel.name}</p>
          <p className="text-ink-500">
            {quote.createdBy.name}
            {quote.createdBy.jobTitle ? `, ${quote.createdBy.jobTitle}` : ""}
          </p>
        </div>
        <div className="h-24 rounded-md border border-ink-200 p-3 text-xs">
          <p className="font-semibold">Bon pour accord — Le client</p>
          <p className="text-ink-500">Date et signature, précédées de la mention « Bon pour accord »</p>
        </div>
      </div>
    </article>
  );
}
