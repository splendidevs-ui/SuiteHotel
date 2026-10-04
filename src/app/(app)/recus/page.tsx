import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterTabs, PageHeader, Pagination, SearchForm, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentMethodLabel } from "@/lib/constants";
import { formatDateTime, plural } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatMoney } from "@/lib/money";
import { RECEIPT_PERIODS, listReceipts } from "@/lib/queries";

export const metadata: Metadata = { title: "Reçus" };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; mode?: string; q?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const [hotel, data] = await Promise.all([getHotel(), listReceipts(params)]);
  const cur = hotel.currency;

  const href = (over: Record<string, string | null>) => {
    const search = new URLSearchParams();
    const merged: Record<string, string | null> = { periode: data.period.key, mode: data.method, q: data.q || null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) search.set(k, v);
    return `/recus?${search.toString()}`;
  };
  const count = data.totals.reduce((s, t) => s + t.count, 0);

  return (
    <>
      <PageHeader
        title="Reçus"
        description="Chaque encaissement émet un reçu numéroté. Un reçu n'est jamais supprimé : la direction peut l'annuler, avec un motif."
      />

      <div className="mb-4 space-y-3">
        <FilterTabs
          tabs={RECEIPT_PERIODS.map((p) => ({ href: href({ periode: p.key, page: null }), label: p.label, active: p.key === data.period.key }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            tabs={[
              { href: href({ mode: null }), label: "Tous les modes", active: !data.method },
              ...PAYMENT_METHODS.map((m) => ({ href: href({ mode: m }), label: PAYMENT_METHOD_LABELS[m], active: data.method === m })),
            ]}
          />
          <SearchForm
            action="/recus"
            q={data.q}
            placeholder="N°, client, objet, référence…"
            hidden={{ periode: data.period.key, mode: data.method }}
          />
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
        <StatCard
          label={`Encaissé · ${data.period.label.toLowerCase()}`}
          value={formatMoney(data.sum, cur)}
          hint={`${plural(count, "reçu")}${data.cancelled ? ` · ${plural(data.cancelled, "annulé")} non compté${data.cancelled > 1 ? "s" : ""}` : ""}`}
        />
        {data.totals.map((t) => (
          <div key={t.method} className="card px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{PAYMENT_METHOD_LABELS[t.method]}</p>
            <p className="mt-1 font-semibold">{formatMoney(t.amount, cur)}</p>
            <p className="text-xs text-muted">{plural(t.count, "reçu")}</p>
          </div>
        ))}
      </div>

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyState title="Aucun reçu sur cette période">Les encaissements des séjours et du restaurant apparaîtront ici.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th>Reçu de</th>
                  <th>Objet</th>
                  <th>Mode</th>
                  <th className="text-right">Montant</th>
                  <th>Encaissé par</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => {
                  const cancelled = Boolean(x.cancelledAt);
                  return (
                    <tr key={x.id} className={cancelled ? "text-muted" : ""}>
                      <td>
                        <Link href={`/recus/${x.id}`} className={`font-mono text-xs font-semibold hover:underline ${cancelled ? "line-through" : ""}`}>
                          {x.number}
                        </Link>
                        {cancelled && <p className="text-xs font-medium text-rose-600">Annulé</p>}
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(x.paidAt)}</td>
                      <td className="font-medium">{x.payerName}</td>
                      <td className="max-w-72">
                        <p className="truncate">{x.label}</p>
                        {x.reservation && (
                          <Link href={`/reservations/${x.reservation.id}`} className="accent text-xs hover:underline">
                            {x.reservation.number}
                          </Link>
                        )}
                        {x.order && (
                          <Link href={`/restaurant/commandes/${x.order.id}`} className="accent text-xs hover:underline">
                            {x.order.number}
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{paymentMethodLabel(x.method)}</td>
                      <td className={`tabular whitespace-nowrap text-right font-semibold ${cancelled ? "line-through" : ""}`}>
                        {formatMoney(x.amount, x.currency)}
                      </td>
                      <td className="whitespace-nowrap text-xs">{x.createdBy.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={data.page}
          pages={data.pages}
          basePath="/recus"
          params={{ periode: data.period.key, mode: data.method, q: data.q }}
        />
      </div>
    </>
  );
}
