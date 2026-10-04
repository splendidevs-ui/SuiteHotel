import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addChargeAction,
  cancelReservationAction,
  checkInAction,
  checkOutAction,
  recordPaymentAction,
  removeChargeAction,
} from "../actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import {
  DownloadIcon,
  LoginIcon,
  LogoutIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  TrashIcon,
  UtensilsIcon,
  WalletIcon,
} from "@/components/icons";
import { CardHeader, Detail, Flash, Meter, PageHeader, ReservationBadge, VipBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  EXTRA_SUGGESTIONS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
  isReservationSource,
  mealPlanLabel,
  paymentMethodLabel,
} from "@/lib/constants";
import { getFolio } from "@/lib/folio";
import { formatDate, formatDateTime, guestName, occupants, plural, toDateInput, todayDate, todayDateInput } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { currencySymbol, formatMoney, formatQuantity, isZeroDecimal, toInputAmount } from "@/lib/money";
import { getOpenOrdersFor } from "@/lib/queries";

export const metadata: Metadata = { title: "Réservation" };

const FLASH: Record<string, string> = {
  creee: "Réservation enregistrée.",
  modifiee: "Réservation mise à jour.",
  arrivee: "Check-in effectué : le client est en séjour.",
  depart: "Départ validé : les chambres sont libérées.",
  annulee: "La réservation a été annulée.",
  prestation: "Prestation ajoutée à la note de séjour.",
  retiree: "Prestation retirée de la note de séjour.",
};

export default async function ReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; recu?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { ok, recu } = await searchParams;
  const [hotel, folio, openOrders] = await Promise.all([getHotel(), getFolio(id), getOpenOrdersFor(id)]);
  if (!folio) notFound();

  const { reservation: r, totals, hours, units, length, paid, balance, lines } = folio;
  const cur = r.currency;
  const today = todayDate();
  const isOpen = r.status === "CONFIRMEE" || r.status === "EN_SEJOUR";
  // Jour du sejour : [arrivee, depart[, ou la journee elle-meme pour un depart le jour de l'arrivee.
  const stayDay = today >= r.checkIn && (today < r.checkOut || today.getTime() === r.checkIn.getTime());
  const arrivalDay = r.status === "CONFIRMEE" && stayDay;
  const name = guestName(r.guest);
  const step = isZeroDecimal(cur) ? "1" : "0.01";
  const chargeDate = stayDay ? todayDateInput() : toDateInput(r.checkIn);
  const pdfHref = `/reservations/${r.id}/note?apercu`;

  return (
    <>
      <PageHeader
        back={{ href: "/reservations", label: "Réservations" }}
        eyebrow={`Réservation ${r.number}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {name}
            {r.guest.vip && <VipBadge />}
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ReservationBadge status={r.status} />
            {formatDate(r.checkIn)} → {formatDate(r.checkOut)} · {length} · {plural(r.rooms.length, "chambre")}
          </span>
        }
        actions={
          <>
            <a href={pdfHref} target="_blank" rel="noreferrer" className="btn btn-outline">
              <DownloadIcon /> Note de séjour
            </a>
            {r.status === "CONFIRMEE" && (
              <Link href={`/reservations/${r.id}/modifier`} className="btn btn-outline">
                <PencilIcon /> Modifier
              </Link>
            )}
          </>
        }
      />

      {ok && FLASH[ok] && (
        <div className="mb-6">
          <Flash>
            {FLASH[ok]}
            {recu && (
              <>
                {" "}
                <Link href={`/recus/${recu}`} className="font-semibold underline">
                  Imprimer le reçu de l&apos;acompte
                </Link>
              </>
            )}
          </Flash>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <CardHeader title="Séjour" />
            <div className="grid gap-x-8 px-5 py-3 sm:grid-cols-2">
              <dl>
                <Detail label="Arrivée">
                  {formatDate(r.checkIn, { weekday: "short" })} à {r.checkInTime}
                </Detail>
                <Detail label="Départ">
                  {formatDate(r.checkOut, { weekday: "short" })} à {r.checkOutTime}
                </Detail>
                <Detail label="Durée">{length}</Detail>
                <Detail label="Formule">{mealPlanLabel(r.mealPlan)}</Detail>
              </dl>
              <dl>
                <Detail label="Origine">{isReservationSource(r.source) ? SOURCE_LABELS[r.source] : r.source}</Detail>
                <Detail label="Enregistrée par">{r.createdBy.name}</Detail>
                <Detail label="Le">{formatDateTime(r.createdAt)}</Detail>
                {r.quote && (
                  <Detail label="Devis d'origine">
                    <Link href={`/devis/${r.quote.id}`} className="accent hover:underline">
                      {r.quote.number}
                    </Link>
                  </Detail>
                )}
              </dl>
            </div>
            {r.notes && (
              <p className="border-t px-5 py-3 text-sm">
                <span className="text-muted">Notes : </span>
                {r.notes}
              </p>
            )}
          </section>

          <section className="card">
            <CardHeader
              title="Chambres"
              description={`${plural(r.rooms.length, "chambre")} · ${plural(totals.persons, "personne")}`}
            />
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Chambre</th>
                    <th>Catégorie</th>
                    <th>Occupants</th>
                    <th className="text-right">{hours !== null ? "Tarif / heure" : "Tarif / nuit"}</th>
                    <th className="text-right">Séjour</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rooms.map((s) => (
                    <tr key={s.id}>
                      <td className="tabular font-semibold">{s.room.number}</td>
                      <td>{s.room.roomType.name}</td>
                      <td>{occupants(s.adults, s.children)}</td>
                      <td className="tabular whitespace-nowrap text-right">{formatMoney(s.nightlyRate, cur)}</td>
                      <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(s.nightlyRate * units, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <CardHeader
              title="Note de séjour"
              description="Montants hors taxes ; TVA et taxe de séjour s'ajoutent au total."
              action={
                <a href={pdfHref} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  <DownloadIcon /> PDF
                </a>
              }
            />
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">P.U. HT</th>
                    <th className="text-right">Montant HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <p className="font-medium">{l.designation}</p>
                        {l.detail && <p className="text-xs text-muted">{l.detail}</p>}
                      </td>
                      <td className="tabular whitespace-nowrap text-right">
                        {formatQuantity(l.quantity)}
                        {l.unit ? ` ${l.unit}` : ""}
                      </td>
                      <td className="tabular whitespace-nowrap text-right">{formatMoney(l.unitPrice, cur)}</td>
                      <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(l.total, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="tabular ml-auto max-w-sm border-t px-5 py-4">
              <Detail label="Total HT">{formatMoney(totals.subtotal, cur)}</Detail>
              <Detail label={`TVA (${formatQuantity(r.vatRate)} %)`}>{formatMoney(totals.vatAmount, cur)}</Detail>
              {totals.cityTaxAmount > 0 && <Detail label="Taxe de séjour">{formatMoney(totals.cityTaxAmount, cur)}</Detail>}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2">
                <dt className="font-semibold">Total TTC</dt>
                <dd className="accent text-lg font-bold">{formatMoney(totals.total, cur)}</dd>
              </div>
              <Detail label="Déjà réglé">{formatMoney(paid, cur)}</Detail>
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="font-semibold">{balance < 0 ? "Trop-perçu" : "Reste à payer"}</dt>
                <dd
                  className={`font-bold ${
                    balance > 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {formatMoney(Math.abs(balance), cur)}
                </dd>
              </div>
            </dl>
          </section>

          {(isOpen || r.charges.length > 0) && (
            <section className="card" id="prestations">
              <CardHeader title="Prestations" description="Spa, transferts, blanchisserie… portés sur la note de séjour." />
              {r.charges.length > 0 && (
                <ul className="divide-y">
                  {r.charges.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{c.designation}</p>
                        <p className="text-xs text-muted">
                          {formatDate(c.date)} · {formatQuantity(c.quantity)} × {formatMoney(c.unitPrice, cur)} · ajoutée
                          par {c.createdBy.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular font-semibold">{formatMoney(c.total, cur)}</span>
                        {isOpen && (
                          <ActionForm action={removeChargeAction}>
                            <input type="hidden" name="chargeId" value={c.id} />
                            <ConfirmSubmit
                              className="btn btn-ghost btn-icon hover:!text-rose-600"
                              message={`Retirer « ${c.designation} » de la note de séjour ?`}
                            >
                              <TrashIcon />
                              <span className="sr-only">Retirer</span>
                            </ConfirmSubmit>
                          </ActionForm>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {isOpen && (
                <ActionForm
                  action={addChargeAction}
                  className="grid gap-3 border-t px-5 py-4 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_9.5rem_auto] sm:items-end"
                >
                  <input type="hidden" name="reservationId" value={r.id} />
                  <datalist id="extras-list">
                    {EXTRA_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <div>
                    <label className="label" htmlFor="designation">
                      Prestation
                    </label>
                    <input id="designation" name="designation" list="extras-list" className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="quantity">
                      Qté
                    </label>
                    <input id="quantity" name="quantity" type="number" min="0" step="any" defaultValue="1" className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="unitPrice">
                      P.U. HT
                    </label>
                    <input id="unitPrice" name="unitPrice" type="number" min="0" step={step} className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="date">
                      Date
                    </label>
                    <input id="date" name="date" type="date" defaultValue={chargeDate} className="input" required />
                  </div>
                  <SubmitButton className="btn btn-outline">Ajouter</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {openOrders.length > 0 && (
            <section className="card">
              <CardHeader title="Additions en cours au restaurant" description="À porter sur la note ou à encaisser avant le départ." />
              <ul className="divide-y">
                {openOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/restaurant/commandes/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-alt">
                      <span className="flex items-center gap-2">
                        <UtensilsIcon className="size-4 text-muted" />
                        <span className="font-mono text-xs font-semibold">{o.number}</span> · {o.tableLabel}
                      </span>
                      <span className="tabular font-semibold">{formatMoney(o.total, cur)} TTC</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <p className="eyebrow">Réception</p>
            {r.status === "CONFIRMEE" && (
              <>
                <p className="mt-2 text-sm">
                  {arrivalDay
                    ? today > r.checkIn
                      ? `Arrivée prévue le ${formatDate(r.checkIn)} : le client est en retard.`
                      : "Client attendu aujourd'hui."
                    : `Arrivée prévue le ${formatDate(r.checkIn, { weekday: "long" })}.`}{" "}
                  Arrivée annoncée à {r.checkInTime} ; chambres disponibles à partir de {hotel.checkInTime}.
                </p>
                <ActionForm action={checkInAction} className="mt-4">
                  <input type="hidden" name="reservationId" value={r.id} />
                  <SubmitButton
                    className="btn btn-primary w-full"
                    disabled={!arrivalDay}
                    pendingLabel="Check-in…"
                    title={arrivalDay ? undefined : `Possible à partir du ${formatDate(r.checkIn)}`}
                  >
                    <LoginIcon /> Effectuer le check-in
                  </SubmitButton>
                </ActionForm>
              </>
            )}
            {r.status === "EN_SEJOUR" && (
              <>
                <p className="mt-2 text-sm">
                  {r.checkedInAt ? `En séjour depuis le ${formatDateTime(r.checkedInAt)}. ` : "En séjour. "}
                  Départ prévu le {formatDate(r.checkOut, { weekday: "long" })} à {r.checkOutTime}.
                </p>
                {balance > 0 && <p className="mt-2 text-xs text-muted">Encaissez le solde avant de valider le départ.</p>}
                <ActionForm action={checkOutAction} className="mt-4">
                  <input type="hidden" name="reservationId" value={r.id} />
                  <SubmitButton className="btn btn-primary w-full" pendingLabel="Départ…">
                    <LogoutIcon /> Valider le départ
                  </SubmitButton>
                </ActionForm>
              </>
            )}
            {r.status === "TERMINEE" && (
              <p className="mt-2 text-sm">Séjour terminé{r.checkedOutAt ? ` le ${formatDateTime(r.checkedOutAt)}` : ""}.</p>
            )}
            {r.status === "ANNULEE" && (
              <p className="mt-2 text-sm">
                Réservation annulée{r.cancelledAt ? ` le ${formatDateTime(r.cancelledAt)}` : ""}
                {r.cancelReason ? ` — ${r.cancelReason}` : ""}.
              </p>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Client</p>
                <p className="mt-1 font-semibold">{name}</p>
                {r.guest.company && <p className="text-sm text-muted">{r.guest.company}</p>}
              </div>
              {r.guest.vip && <VipBadge />}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {r.guest.phone && (
                <li className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-muted" /> {r.guest.phone}
                </li>
              )}
              {r.guest.email && (
                <li className="flex items-center gap-2 break-all">
                  <MailIcon className="size-4 shrink-0 text-muted" /> {r.guest.email}
                </li>
              )}
              {r.guest.nationality && <li className="text-muted">Nationalité : {r.guest.nationality}</li>}
              {r.guest.idNumber && (
                <li className="text-muted">
                  {r.guest.idType ?? "Pièce"} n° {r.guest.idNumber}
                </li>
              )}
            </ul>
            <Link href={`/clients/${r.guest.id}`} className="accent mt-4 inline-block text-sm font-medium hover:underline">
              Fiche client →
            </Link>
          </section>

          <section className="card" id="reglement">
            <div className="p-5">
              <p className="eyebrow">Règlement</p>
              <p className={`mt-2 text-2xl font-semibold ${balance > 0 ? "" : "text-emerald-700 dark:text-emerald-300"}`}>
                {balance > 0 ? formatMoney(balance, cur) : balance < 0 ? formatMoney(-balance, cur) : "Soldé"}
              </p>
              <p className="text-xs text-muted">
                {balance > 0 ? "reste à payer · " : balance < 0 ? "trop-perçu · " : ""}
                {formatMoney(paid, cur)} réglés sur {formatMoney(totals.total, cur)}
              </p>
              <Meter value={totals.total ? paid / totals.total : 0} label="Part du séjour déjà réglée" />
            </div>
            {balance > 0 && r.status !== "ANNULEE" && (
              <ActionForm action={recordPaymentAction} className="space-y-3 border-t px-5 py-4">
                <input type="hidden" name="reservationId" value={r.id} />
                <div>
                  <label className="label" htmlFor="amount">
                    Montant ({currencySymbol(cur)})
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step={step}
                    max={toInputAmount(balance, cur)}
                    defaultValue={toInputAmount(balance, cur)}
                    className="input"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="method">
                      Mode
                    </label>
                    <select id="method" name="method" className="select" defaultValue="CARTE">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="reference">
                      Référence
                    </label>
                    <input id="reference" name="reference" className="input" placeholder="Facultatif" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="payerName">
                    Payé par
                  </label>
                  <input id="payerName" name="payerName" className="input" placeholder={name} />
                </div>
                <SubmitButton className="btn btn-primary w-full" pendingLabel="Encaissement…">
                  <WalletIcon /> Encaisser et émettre le reçu
                </SubmitButton>
              </ActionForm>
            )}
          </section>

          <section className="card">
            <CardHeader title="Reçus" description={plural(r.receipts.length, "reçu émis", "reçus émis")} />
            {r.receipts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Aucun encaissement pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y">
                {r.receipts.map((x) => (
                  <li key={x.id}>
                    <Link href={`/recus/${x.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-alt">
                      <span className="min-w-0">
                        <span className={`font-mono text-xs font-semibold ${x.cancelledAt ? "text-muted line-through" : ""}`}>
                          {x.number}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDateTime(x.paidAt)} · {paymentMethodLabel(x.method)}
                          {x.cancelledAt ? " · annulé" : ""}
                        </span>
                      </span>
                      <span className={`tabular font-semibold ${x.cancelledAt ? "text-muted line-through" : ""}`}>
                        {formatMoney(x.amount, cur)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {r.status === "CONFIRMEE" && (
            <details className="card p-5">
              <summary className="cursor-pointer text-sm font-semibold text-rose-700 dark:text-rose-300">
                Annuler la réservation
              </summary>
              <ActionForm action={cancelReservationAction} className="mt-3 space-y-3">
                <input type="hidden" name="reservationId" value={r.id} />
                <label className="label" htmlFor="reason">
                  Motif
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  className="textarea"
                  placeholder="Changement de programme du client…"
                  required
                  minLength={3}
                />
                <p className="text-xs text-muted">
                  Les acomptes encaissés restent sur leurs reçus ; seule la direction peut annuler un reçu.
                </p>
                <ConfirmSubmit message="Annuler définitivement cette réservation ?">Confirmer l&apos;annulation</ConfirmSubmit>
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
