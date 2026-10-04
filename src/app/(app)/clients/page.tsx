import type { Metadata } from "next";
import Link from "next/link";
import { GuestForm } from "@/components/guest-form";
import { StarIcon, UserPlusIcon } from "@/components/icons";
import { EmptyState, PageHeader, Pagination, ReservationBadge, SearchForm } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateRange, plural } from "@/lib/format";
import { listGuests } from "@/lib/queries";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const data = await listGuests(params);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Coordonnées, pièce d'identité, préférences et historique des séjours de chaque client."
      />

      <details className="card mb-6 p-5" open={data.total === 0 && !data.q}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <UserPlusIcon className="accent size-5" /> Nouveau client
        </summary>
        <div className="mt-5">
          <GuestForm />
        </div>
      </details>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{plural(data.total, "client")}</p>
        <SearchForm action="/clients" q={data.q} placeholder="Nom, téléphone, e-mail, société…" />
      </div>

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyState title="Aucun client">{data.q ? "Aucune fiche ne correspond à cette recherche." : "Les fiches sont aussi créées depuis une réservation ou un devis."}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Nationalité</th>
                  <th>Séjours</th>
                  <th>Dernier séjour</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => {
                  const last = g.reservations[0];
                  return (
                    <tr key={g.id}>
                      <td>
                        <Link href={`/clients/${g.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                          {g.vip && <StarIcon className="accent size-3.5" />}
                          {g.lastName.toUpperCase()} {g.firstName}
                        </Link>
                        {g.company && <p className="text-xs text-muted">{g.company}</p>}
                      </td>
                      <td className="text-sm">
                        {g.phone && <p>{g.phone}</p>}
                        {g.email && <p className="text-xs text-muted">{g.email}</p>}
                      </td>
                      <td className="text-muted">{g.nationality ?? "—"}</td>
                      <td>
                        {g._count.reservations}
                        {g._count.quotes > 0 && <span className="text-xs text-muted"> · {plural(g._count.quotes, "devis", "devis")}</span>}
                      </td>
                      <td>
                        {last ? (
                          <Link href={`/reservations/${last.id}`} className="flex flex-wrap items-center gap-2 hover:underline">
                            <span className="whitespace-nowrap text-sm">{formatDateRange(last.checkIn, last.checkOut)}</span>
                            <ReservationBadge status={last.status} />
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pages={data.pages} basePath="/clients" params={{ q: data.q }} />
      </div>
    </>
  );
}
