import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { EmptyState, FilterTabs, Flash, PageHeader, Pagination, QuoteBadge, SearchForm } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { QUOTE_FILTERS, QUOTE_STATUS_META, displayQuoteStatus } from "@/lib/constants";
import { formatDate, formatDateRange, guestName, plural } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { listQuotes } from "@/lib/queries";

export const metadata: Metadata = { title: "Devis" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; q?: string; page?: string; ok?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const data = await listQuotes(params);
  const qs = data.q ? `&q=${encodeURIComponent(data.q)}` : "";

  const tabs = [
    { href: `/devis${data.q ? `?q=${encodeURIComponent(data.q)}` : ""}`, label: "Tous", active: !data.status },
    ...QUOTE_FILTERS.map((s) => ({
      href: `/devis?statut=${s}${qs}`,
      label: QUOTE_STATUS_META[s].label,
      active: data.status === s,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Devis"
        description="Proposez un séjour chiffré, puis transformez-le en réservation dès l'accord du client."
        actions={
          <Link href="/devis/nouveau" className="btn btn-primary">
            <PlusIcon /> Nouveau devis
          </Link>
        }
      />
      {params.ok === "supprime" && (
        <div className="mb-4">
          <Flash>Le brouillon a été supprimé.</Flash>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs tabs={tabs} />
        <SearchForm action="/devis" q={data.q} placeholder="N°, client, société…" hidden={{ statut: data.status }} />
      </div>

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyState title="Aucun devis">
            {data.q || data.status ? "Aucun devis ne correspond à ces critères." : "Créez votre premier devis de séjour."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Séjour</th>
                  <th>Chambres</th>
                  <th className="text-right">Total TTC</th>
                  <th>Statut</th>
                  <th>Validité</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((q) => {
                  const rooms = q.rooms.reduce((s, r) => s + r.quantity, 0);
                  return (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/devis/${q.id}`} className="font-mono text-xs font-semibold hover:underline">
                          {q.number}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/devis/${q.id}`} className="font-semibold hover:underline">
                          {guestName(q.guest)}
                        </Link>
                        {q.guest.company && <p className="text-xs text-muted">{q.guest.company}</p>}
                      </td>
                      <td className="whitespace-nowrap">{formatDateRange(q.checkIn, q.checkOut)}</td>
                      <td>{plural(rooms, "chambre")}</td>
                      <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(q.total, q.currency)}</td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <QuoteBadge status={displayQuoteStatus(q, data.today)} />
                          {q.reservation && (
                            <Link href={`/reservations/${q.reservation.id}`} className="accent text-xs font-medium hover:underline">
                              → {q.reservation.number}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">{formatDate(q.validUntil)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pages={data.pages} basePath="/devis" params={{ statut: data.status, q: data.q }} />
      </div>
    </>
  );
}
