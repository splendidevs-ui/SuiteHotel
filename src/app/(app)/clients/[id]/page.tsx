import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guest-form";
import { DocumentIcon, PlusIcon } from "@/components/icons";
import { CardHeader, EmptyState, Flash, PageHeader, QuoteBadge, ReservationBadge, StatCard, VipBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { displayQuoteStatus } from "@/lib/constants";
import { formatDateRange, guestName, plural, todayDate } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatMoney } from "@/lib/money";
import { getGuest, guestSpending } from "@/lib/queries";
import { nightsBetween, stayLength } from "@/lib/stay-math";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { ok } = await searchParams;
  const [hotel, guest, spent] = await Promise.all([getHotel(), getGuest(id), guestSpending(id)]);
  if (!guest) notFound();

  const today = todayDate();
  const stays = guest.reservations.filter((r) => r.status !== "ANNULEE");
  const nights = stays.reduce((sum, r) => sum + nightsBetween(r.checkIn, r.checkOut), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        eyebrow="Fiche client"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {guestName(guest)}
            {guest.vip && <VipBadge />}
          </span>
        }
        description={guest.company ?? undefined}
        actions={
          <>
            <Link href={`/devis/nouveau?client=${guest.id}`} className="btn btn-outline">
              <DocumentIcon /> Nouveau devis
            </Link>
            <a href={`/reservations/nouvelle/preparer?client=${guest.id}`} className="btn btn-primary">
              <PlusIcon /> Nouvelle réservation
            </a>
          </>
        }
      />

      {ok && (
        <div className="mb-6">
          <Flash>{ok === "cree" ? "Fiche client créée." : "Fiche client enregistrée."}</Flash>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Séjours" value={stays.length} hint={plural(guest.reservations.length - stays.length, "annulation")} />
        <StatCard label="Nuits" value={nights} />
        <StatCard label="Total réglé" value={formatMoney(spent, hotel.currency)} hint="Reçus des séjours, hors annulés" />
        <StatCard label="Devis" value={guest.quotes.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <CardHeader title="Séjours" />
            {guest.reservations.length === 0 ? (
              <EmptyState title="Aucun séjour pour l'instant." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Dates</th>
                      <th>Chambres</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guest.reservations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/reservations/${r.id}`} className="font-mono text-xs font-semibold hover:underline">
                            {r.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">
                          {formatDateRange(r.checkIn, r.checkOut)}
                          <p className="text-xs text-muted">{stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime)}</p>
                        </td>
                        <td className="tabular">{r.rooms.map((x) => x.room.number).join(", ")}</td>
                        <td>
                          <ReservationBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <CardHeader title="Devis" />
            {guest.quotes.length === 0 ? (
              <EmptyState title="Aucun devis." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Séjour</th>
                      <th className="text-right">Total TTC</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guest.quotes.map((q) => (
                      <tr key={q.id}>
                        <td>
                          <Link href={`/devis/${q.id}`} className="font-mono text-xs font-semibold hover:underline">
                            {q.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{formatDateRange(q.checkIn, q.checkOut)}</td>
                        <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(q.total, q.currency)}</td>
                        <td>
                          <QuoteBadge status={displayQuoteStatus(q, today)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="card self-start p-5">
          <h2 className="mb-4 font-semibold">Coordonnées et préférences</h2>
          <GuestForm guest={guest} />
        </section>
      </div>
    </>
  );
}
