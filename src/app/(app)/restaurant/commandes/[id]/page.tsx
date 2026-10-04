import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addItemAction, cancelOrderAction, changeLineAction, chargeToRoomAction, payOrderAction } from "../../actions";
import { RestaurantDisabled } from "../../disabled";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import { BedIcon, MinusIcon, PlusIcon, WalletIcon } from "@/components/icons";
import { CardHeader, Flash, OrderBadge, PageHeader } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { MENU_CATEGORIES, MENU_CATEGORY_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentMethodLabel } from "@/lib/constants";
import { formatDateTime, formatTime, guestName, plural } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatMoney, formatQuantity } from "@/lib/money";
import { getInHouse, getMenu, getOrder } from "@/lib/queries";

export const metadata: Metadata = { title: "Addition" };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { ok } = await searchParams;
  const [hotel, order, menu, inHouse] = await Promise.all([getHotel(), getOrder(id), getMenu(), getInHouse()]);
  if (!order) notFound();
  if (!hotel.restaurantEnabled && order.status === "OUVERTE") return <RestaurantDisabled canEnable={isDirection(user)} />;

  const cur = hotel.currency;
  const open = order.status === "OUVERTE";
  const hasItems = order.lines.length > 0;
  const groups = MENU_CATEGORIES.map((c) => ({ category: c, items: menu.filter((i) => i.category === c) })).filter(
    (g) => g.items.length > 0,
  );
  const client = order.reservation
    ? `Ch. ${order.reservation.rooms.map((x) => x.room.number).join(", ")} · ${guestName(order.reservation.guest)}`
    : (order.guestName ?? "Client de passage");

  return (
    <>
      <PageHeader
        back={{ href: "/restaurant", label: hotel.restaurantName ?? "Restaurant" }}
        eyebrow={`Addition ${order.number}`}
        title={order.tableLabel}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <OrderBadge status={order.status} />
            {client} · {plural(order.covers, "couvert")} · ouverte à {formatTime(order.createdAt)} par {order.createdBy.name}
          </span>
        }
      />
      {ok === "imputee" && (
        <div className="mb-6">
          <Flash>L&apos;addition a été portée sur la note de séjour du client.</Flash>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          {open ? (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.category} className="card">
                  <CardHeader title={MENU_CATEGORY_LABELS[g.category]} />
                  <ul className="divide-y">
                    {g.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className={`font-medium ${item.available ? "" : "text-muted line-through"}`}>{item.name}</p>
                          {item.description && <p className="truncate text-xs text-muted">{item.description}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="tabular text-sm">{formatMoney(item.price, cur)}</span>
                          {item.available ? (
                            <ActionForm action={addItemAction}>
                              <input type="hidden" name="orderId" value={order.id} />
                              <input type="hidden" name="menuItemId" value={item.id} />
                              <button type="submit" className="btn btn-outline btn-icon" aria-label={`Ajouter ${item.name}`}>
                                <PlusIcon />
                              </button>
                            </ActionForm>
                          ) : (
                            <span className="text-xs font-medium text-muted">Épuisé</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length === 0 && (
                <div className="card px-6 py-10 text-center text-sm text-muted">
                  La carte est vide.{" "}
                  <Link href="/restaurant/carte" className="accent font-medium underline">
                    Ajouter des plats
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <section className="card p-6">
              <p className="eyebrow">Addition clôturée</p>
              {order.status === "IMPUTEE" && order.reservation && (
                <p className="mt-2 text-sm">
                  Portée sur la note de séjour de {guestName(order.reservation.guest)}
                  {order.closedAt ? ` le ${formatDateTime(order.closedAt)}` : ""}.{" "}
                  <Link href={`/reservations/${order.reservation.id}`} className="accent font-medium hover:underline">
                    Voir la réservation →
                  </Link>
                </p>
              )}
              {order.status === "REGLEE" && (
                <div className="mt-2 space-y-1 text-sm">
                  <p>Réglée{order.closedAt ? ` le ${formatDateTime(order.closedAt)}` : ""}.</p>
                  {order.receipts.map((r) => (
                    <p key={r.id}>
                      <Link href={`/recus/${r.id}`} className="accent font-medium hover:underline">
                        Reçu {r.number}
                      </Link>{" "}
                      · {paymentMethodLabel(r.method)} {r.cancelledAt ? "(annulé)" : ""}
                    </p>
                  ))}
                </div>
              )}
              {order.status === "ANNULEE" && <p className="mt-2 text-sm">Addition annulée.</p>}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="bg-ink-950 px-5 py-4 text-white">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gold-400">Addition</p>
              <p className="mt-1 text-sm text-ink-300">
                {order.tableLabel} · {client}
              </p>
            </div>
            {hasItems ? (
              <ul className="divide-y">
                {order.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{line.name}</p>
                      <p className="text-xs text-muted">
                        {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice, cur)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {open && (
                        <ActionForm action={changeLineAction} className="flex items-center gap-1">
                          <input type="hidden" name="lineId" value={line.id} />
                          <button type="submit" name="delta" value="-1" className="btn btn-ghost btn-icon" aria-label={`Retirer un ${line.name}`}>
                            <MinusIcon />
                          </button>
                          <button type="submit" name="delta" value="1" className="btn btn-ghost btn-icon" aria-label={`Ajouter un ${line.name}`}>
                            <PlusIcon />
                          </button>
                        </ActionForm>
                      )}
                      <span className="tabular w-24 text-right font-semibold">{formatMoney(line.total, cur)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted">Ajoutez les plats depuis la carte.</p>
            )}
            <dl className="tabular space-y-1.5 border-t px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Sous-total HT</dt>
                <dd>{formatMoney(order.subtotal, cur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">TVA ({formatQuantity(order.vatRate)} %)</dt>
                <dd>{formatMoney(order.vatAmount, cur)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">Total TTC</dt>
                <dd className="accent text-xl font-bold">{formatMoney(order.total, cur)}</dd>
              </div>
            </dl>
          </section>

          {open && hasItems && (
            <>
              <section className="card">
                <CardHeader title="Porter sur la note de séjour" description="Le montant HT rejoint la note ; la TVA y est calculée." />
                <ActionForm action={chargeToRoomAction} className="space-y-3 px-5 py-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  {order.reservation ? (
                    <p className="text-sm">{client}</p>
                  ) : (
                    <select name="reservationId" className="select" aria-label="Client en séjour" required defaultValue="">
                      <option value="" disabled>
                        {inHouse.length ? "Choisir la chambre…" : "Aucun client en séjour"}
                      </option>
                      {inHouse.map((r) => (
                        <option key={r.id} value={r.id}>
                          Ch. {r.rooms.map((x) => x.room.number).join(", ")} · {guestName(r.guest)}
                        </option>
                      ))}
                    </select>
                  )}
                  <SubmitButton className="btn btn-outline w-full" disabled={!order.reservation && inHouse.length === 0}>
                    <BedIcon /> Porter sur la chambre
                  </SubmitButton>
                </ActionForm>
              </section>

              <section className="card">
                <CardHeader title="Encaisser" description="Un reçu est émis immédiatement." />
                <ActionForm action={payOrderAction} className="space-y-3 px-5 py-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <select name="method" className="select" defaultValue="CARTE" aria-label="Mode de règlement">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                    <input name="reference" className="input" placeholder="Référence" aria-label="Référence" />
                  </div>
                  <input
                    name="payerName"
                    className="input"
                    placeholder={order.reservation ? guestName(order.reservation.guest) : (order.guestName ?? "Nom du client")}
                    aria-label="Payé par"
                  />
                  <SubmitButton className="btn btn-primary w-full" pendingLabel="Encaissement…">
                    <WalletIcon /> Encaisser {formatMoney(order.total, cur)}
                  </SubmitButton>
                </ActionForm>
              </section>
            </>
          )}

          {open && (
            <details className="card p-5">
              <summary className="cursor-pointer text-sm font-semibold text-rose-700 dark:text-rose-300">Annuler l&apos;addition</summary>
              <ActionForm action={cancelOrderAction} className="mt-3">
                <input type="hidden" name="orderId" value={order.id} />
                <ConfirmSubmit message="Annuler cette addition ?">Confirmer l&apos;annulation</ConfirmSubmit>
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
