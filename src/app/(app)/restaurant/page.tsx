import type { Metadata } from "next";
import Link from "next/link";
import { createOrderAction } from "./actions";
import { RestaurantDisabled } from "./disabled";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { StarIcon, UtensilsIcon } from "@/components/icons";
import { CardHeader, EmptyState, Flash, OrderBadge, PageHeader } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { formatTime, guestName, plural } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatMoney } from "@/lib/money";
import { getRestaurantBoard } from "@/lib/queries";

export const metadata: Metadata = { title: "Restaurant" };

const TABLES = ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "Table 6", "Terrasse", "Bar", "Room service"];

export default async function RestaurantPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireUser();
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled) return <RestaurantDisabled canEnable={isDirection(user)} />;
  const { ok } = await searchParams;
  const { open, closedToday, inHouse } = await getRestaurantBoard();
  const cur = hotel.currency;

  return (
    <>
      <PageHeader
        eyebrow="Restauration"
        title={hotel.restaurantName ?? "Restaurant"}
        description="Additions des tables et du room service : portées sur la note d'un client en séjour, ou encaissées."
        actions={
          <Link href="/restaurant/carte" className="btn btn-outline">
            <UtensilsIcon /> La carte
          </Link>
        }
      />
      {ok === "annulee" && (
        <div className="mb-6">
          <Flash tone="info">L&apos;addition a été annulée.</Flash>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="card self-start">
          <CardHeader title="Nouvelle addition" />
          <ActionForm action={createOrderAction} className="space-y-3 px-5 py-4">
            <datalist id="tables">
              {TABLES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <div>
                <label className="label" htmlFor="tableLabel">
                  Table
                </label>
                <input id="tableLabel" name="tableLabel" list="tables" required className="input" placeholder="Table 4" />
              </div>
              <div>
                <label className="label" htmlFor="covers">
                  Couverts
                </label>
                <input id="covers" name="covers" type="number" min="1" max="200" defaultValue="2" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="reservationId">
                Client en séjour
              </label>
              <select id="reservationId" name="reservationId" className="select" defaultValue="">
                <option value="">— Client de passage —</option>
                {inHouse.map((r) => (
                  <option key={r.id} value={r.id}>
                    Ch. {r.rooms.map((x) => x.room.number).join(", ")} · {guestName(r.guest)}
                  </option>
                ))}
              </select>
              <p className="hint">Permet de porter l&apos;addition sur la note de séjour.</p>
            </div>
            <div>
              <label className="label" htmlFor="guestName">
                Nom (client de passage)
              </label>
              <input id="guestName" name="guestName" className="input" placeholder="M. et Mme Diallo" />
            </div>
            <div>
              <label className="label" htmlFor="notes">
                Remarques
              </label>
              <input id="notes" name="notes" className="input" placeholder="Anniversaire, allergie…" />
            </div>
            <SubmitButton className="btn btn-primary w-full" pendingLabel="Ouverture…">
              Ouvrir l&apos;addition
            </SubmitButton>
          </ActionForm>
        </section>

        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="eyebrow mb-3">Additions en cours · {open.length}</h2>
            {open.length === 0 ? (
              <div className="card">
                <EmptyState title="Aucune addition en cours." />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {open.map((o) => (
                  <Link key={o.id} href={`/restaurant/commandes/${o.id}`} className="card block p-4 transition-colors hover:border-gold-400">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-serif text-lg font-semibold">{o.tableLabel}</p>
                      <span className="font-mono text-xs text-muted">{o.number}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm">
                      {o.reservation ? (
                        <>
                          {o.reservation.guest.vip && <StarIcon className="accent size-3.5" />}
                          Ch. {o.reservation.rooms.map((x) => x.room.number).join(", ")} · {guestName(o.reservation.guest)}
                        </>
                      ) : (
                        <span className="text-muted">{o.guestName ?? "Client de passage"}</span>
                      )}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-xs text-muted">
                        {plural(o.covers, "couvert")} · {plural(o.lines.reduce((s, l) => s + l.quantity, 0), "article")} · depuis{" "}
                        {formatTime(o.createdAt)}
                      </p>
                      <p className="font-semibold">{formatMoney(o.total, cur)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <CardHeader title="Clôturées aujourd'hui" />
            {closedToday.length === 0 ? (
              <EmptyState title="Aucune addition clôturée aujourd'hui." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Table</th>
                      <th>Client</th>
                      <th>Statut</th>
                      <th className="text-right">Total TTC</th>
                      <th>Heure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedToday.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/restaurant/commandes/${o.id}`} className="font-mono text-xs font-semibold hover:underline">
                            {o.number}
                          </Link>
                        </td>
                        <td>{o.tableLabel}</td>
                        <td>{o.reservation ? guestName(o.reservation.guest) : (o.guestName ?? "—")}</td>
                        <td>
                          <OrderBadge status={o.status} />
                        </td>
                        <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(o.total, cur)}</td>
                        <td className="text-xs text-muted">{o.closedAt ? formatTime(o.closedAt) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
