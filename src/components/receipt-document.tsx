import { paymentMethodLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { Hotel } from "@/lib/hotel";
import { formatMoney } from "@/lib/money";
import { amountInWords } from "@/lib/number-words";
import type { ReceiptDetail } from "@/lib/queries";

/** Apercu du recu tel qu'il sera imprime (meme contenu que le PDF A5). */
export function ReceiptDocument({ hotel, receipt, context }: { hotel: Hotel; receipt: ReceiptDetail; context: string[] }) {
  const cur = receipt.currency;
  const cancelled = Boolean(receipt.cancelledAt);
  return (
    <article className="paper relative overflow-hidden p-6 text-[0.84rem] leading-relaxed sm:p-9">
      {cancelled && (
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none font-sans text-7xl font-black tracking-widest text-rose-600/15 sm:text-8xl"
          aria-hidden="true"
        >
          ANNULÉ
        </span>
      )}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-gold-600 pb-5">
        <div className="min-w-0">
          <p className="font-serif text-2xl font-semibold">{hotel.name}</p>
          {hotel.tagline && <p className="text-xs font-medium text-gold-700">{hotel.tagline}</p>}
          <p className="mt-1 text-xs text-ink-500">
            {[hotel.city, hotel.country].filter(Boolean).join(", ")}
            {hotel.phone ? ` · Tél. ${hotel.phone}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-3xl font-semibold tracking-wide text-gold-700">REÇU</p>
          <p className="mt-1 font-mono text-sm font-bold">{receipt.number}</p>
          <p className="mt-1 text-xs text-ink-500">Le {formatDateTime(receipt.paidAt)}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <dl className="space-y-4">
          <div>
            <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">Reçu de</dt>
            <dd className="text-base font-semibold">{receipt.payerName}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">La somme de</dt>
            <dd className="font-semibold">{amountInWords(receipt.amount, cur)}.</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-500">Objet</dt>
            <dd>{receipt.label}</dd>
            {context.map((line) => (
              <dd key={line} className="text-xs text-ink-500">
                {line}
              </dd>
            ))}
          </div>
        </dl>
        <div className="self-start rounded-md bg-gold-700 p-4 text-white">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gold-100">Montant reçu</p>
          <p className="mt-2 text-right text-2xl font-bold">{formatMoney(receipt.amount, cur)}</p>
          <p className="mt-2 text-xs text-gold-100">
            {paymentMethodLabel(receipt.method)}
            {receipt.reference ? ` · ${receipt.reference}` : ""}
          </p>
        </div>
      </div>

      {receipt.balanceAfter !== null && (
        <p className={`mt-5 text-sm font-semibold ${receipt.balanceAfter > 0 ? "" : "text-gold-700"}`}>
          {receipt.balanceAfter > 0
            ? `Reste à payer sur le séjour après ce règlement : ${formatMoney(receipt.balanceAfter, cur)}`
            : "Séjour entièrement réglé à la date de ce reçu."}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="h-20 rounded-md border border-ink-200 p-3 text-xs">
          <p className="font-semibold">Le client</p>
          <p className="text-ink-500">Signature</p>
        </div>
        <div className="h-20 rounded-md border border-ink-200 p-3 text-xs">
          <p className="font-semibold">Pour {hotel.name}</p>
          <p className="text-ink-500">Encaissé par {receipt.createdBy.name}</p>
        </div>
      </div>
    </article>
  );
}
