import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, StarIcon } from "@/components/icons";
import { EmptyState, FilterTabs, PageHeader, Pagination, ReservationBadge, SearchForm } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { mealPlanLabel } from "@/lib/constants";
import { formatDateRange, guestName, plural } from "@/lib/format";
import { RESERVATION_VIEWS, listReservations } from "@/lib/queries";
import { nightsBetween, stayLength } from "@/lib/stay-math";

export const metadata: Metadata = { title: "Réservations" };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const data = await listReservations(params);
  const all = Object.values(data.countByStatus).reduce((a, b) => a + b, 0);

  const tabs = RESERVATION_VIEWS.map((v) => ({
    href: `/reservations?vue=${v.key}${data.q ? `&q=${encodeURIComponent(data.q)}` : ""}`,
    label: v.label,
    count: v.status ? (data.countByStatus[v.status] ?? 0) : all,
    active: v.key === data.view.key,
  }));

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Une réservation regroupe une ou plusieurs chambres d'un même client, sur les mêmes dates."
        actions={
          <Link href="/reservations/nouvelle" className="btn btn-primary">
            <PlusIcon /> Nouvelle réservation
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs tabs={tabs} />
        <SearchForm action="/reservations" q={data.q} placeholder="N°, client, téléphone, chambre…" hidden={{ vue: data.view.key }} />
      </div>

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyState title="Aucune réservation">
            {data.q ? "Aucun résultat pour cette recherche." : "Les réservations de cette catégorie apparaîtront ici."}
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
                  <th>Formule</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const nights = nightsBetween(r.checkIn, r.checkOut);
                  const persons = r.rooms.reduce((s, x) => s + x.adults + x.children, 0);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/reservations/${r.id}`} className="font-mono text-xs font-semibold hover:underline">
                          {r.number}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/reservations/${r.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                          {r.guest.vip && <StarIcon className="accent size-3.5" />}
                          {guestName(r.guest)}
                        </Link>
                        {r.guest.company && <p className="text-xs text-muted">{r.guest.company}</p>}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatDateRange(r.checkIn, r.checkOut)}
                        <p className="text-xs text-muted">{stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime)}</p>
                      </td>
                      <td>
                        <span className="tabular font-medium">{r.rooms.map((x) => x.room.number).join(", ")}</span>
                        <p className="text-xs text-muted">{plural(persons, "personne")}</p>
                      </td>
                      <td className="whitespace-nowrap text-muted">{mealPlanLabel(r.mealPlan)}</td>
                      <td>
                        <ReservationBadge status={r.status} />
                      </td>
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
          basePath="/reservations"
          params={{ vue: data.view.key, q: data.q }}
        />
      </div>
    </>
  );
}
