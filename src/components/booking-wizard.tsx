"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { autosaveDraftAction, resetDraftAction, submitStepAction } from "@/app/(app)/reservations/nouvelle/actions";
import { withProgress, type BookingDraft, type BookingStep } from "@/lib/booking-draft";
import {
  MEAL_PLAN_META,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RESERVATION_SOURCES,
  SOURCE_LABELS,
  type PaymentMethod,
  type ReservationSource,
} from "@/lib/constants";
import type { FormState } from "@/lib/form";
import { addDaysToDateInput, formatDateRange, formatDayMonth, plural } from "@/lib/format";
import { currencySymbol, formatMoney, isZeroDecimal, toInputAmount, toStoredAmount } from "@/lib/money";
import type { ReservationFormData } from "@/lib/queries";
import type { ReservationFormRoom } from "@/lib/schemas";
import { addHoursToTime, daysBetween, nightsBetween, stayHours, stayLength, staysOverlap, stayTotals } from "@/lib/stay-math";
import { GuestPicker } from "./guest-picker";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, TrashIcon } from "./icons";
import type { ReservationPricing } from "./reservation-form";
import { StaySummary } from "./stay-summary";

const STEPS: { key: BookingStep; label: string; hint: string }[] = [
  { key: "chambres", label: "Chambres", hint: "Le choix des chambres" },
  { key: "sejour", label: "Séjour", hint: "Dates, formule, occupants" },
  { key: "client", label: "Client", hint: "Client et confirmation" },
];

function num(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active ? "border-gold-600 bg-gold-50 text-gold-800 dark:bg-gold-500/15 dark:text-gold-200" : "text-muted hover:border-gold-400"
  }`;

const floorLabel = (floor: number) => (floor === 0 ? "Rez-de-chaussée" : `${floor}${floor === 1 ? "er" : "e"} étage`);

/** La touche Entrée dans un champ n'envoie pas le formulaire : ce sont les boutons qui choisissent l'action. */
function blockImplicitSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
}

/**
 * Parcours de reservation en trois etapes : chambres, sejour, client. Chaque
 * modification est enregistree dans la session ; « Continuer » fait valider
 * l'etape par le serveur, « Confirmer la réservation » cree la reservation.
 */
export function BookingWizard({
  step,
  initial,
  data,
  pricing,
  today,
  startedAt,
}: {
  step: BookingStep;
  initial: BookingDraft;
  data: ReservationFormData;
  pricing: ReservationPricing;
  today: string;
  startedAt: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitStepAction, undefined);
  const [values, setValues] = useState<BookingDraft>(initial);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'envoi part de l'etat React : le formulaire reste inerte tant que React n'a pas pris la main.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const update = (fn: (v: BookingDraft) => BookingDraft) => {
    setValues(fn);
    setTouched(true);
    setSaved("saving");
  };
  const set = (patch: Partial<BookingDraft>) => update((v) => ({ ...v, ...patch }));
  const setRoom = (roomId: string, patch: Partial<ReservationFormRoom>) =>
    update((v) => ({ ...v, rooms: v.rooms.map((r) => (r.roomId === roomId ? { ...r, ...patch } : r)) }));
  const setDeposit = (patch: Partial<BookingDraft["deposit"]>) =>
    update((v) => ({ ...v, deposit: { ...v.deposit, ...patch } }));

  const payload = useMemo(
    () =>
      JSON.stringify({
        rooms: values.rooms,
        checkIn: values.checkIn,
        checkInTime: values.checkInTime,
        checkOut: values.checkOut,
        checkOutTime: values.checkOutTime,
        mealPlan: values.mealPlan,
        source: values.source,
        notes: values.notes,
        guest: values.guest,
        deposit: values.deposit,
      }),
    [values],
  );

  // Sauvegarde dans la session, 600 ms apres la derniere modification.
  useEffect(() => {
    if (!touched) return;
    timer.current = setTimeout(() => {
      autosaveDraftAction(payload).then(
        () => setSaved("saved"),
        () => setSaved("idle"),
      );
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [payload, touched]);

  const { currency } = pricing;
  const symbol = currencySymbol(currency);
  const priceStep = isZeroDecimal(currency) ? "1" : "0.01";
  const types = useMemo(() => new Map(data.types.map((t) => [t.id, t])), [data.types]);
  const roomsById = useMemo(() => new Map(data.rooms.map((r) => [r.id, r])), [data.rooms]);

  const progress = withProgress(initial, values).done;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const previous = STEPS[stepIndex - 1]?.key;

  const nights = nightsBetween(values.checkIn, values.checkOut);
  // Depart le jour de l'arrivee : sejour a l'heure, l'heure de depart doit suivre l'arrivee.
  const datesOk = nights >= 1 && !(values.checkOut === values.checkIn && values.checkOutTime <= values.checkInTime);
  const hours = stayHours(values.checkIn, values.checkOut, values.checkInTime, values.checkOutTime);
  const units = hours ?? nights;
  const per = hours !== null ? "heure" : "nuit";
  const bookingOf = (roomId: string) =>
    datesOk
      ? data.bookings.find((b) => b.roomId === roomId && staysOverlap(b, values))
      : undefined;
  const nextBooking = (roomId: string) =>
    data.bookings
      .filter((b) => b.roomId === roomId && b.checkIn >= values.checkOut)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  const selected = new Set(values.rooms.map((r) => r.roomId));
  const conflicts = values.rooms.filter((r) => bookingOf(r.roomId));

  const toggleRoom = (roomId: string) => {
    if (selected.has(roomId)) {
      update((v) => ({ ...v, rooms: v.rooms.filter((r) => r.roomId !== roomId) }));
      return;
    }
    const room = roomsById.get(roomId);
    const type = room && types.get(room.roomTypeId);
    if (!room || !type) return;
    update((v) => ({
      ...v,
      rooms: [
        ...v.rooms,
        { roomId, adults: String(Math.min(2, type.capacity)), children: "0", nightlyRate: toInputAmount(type.basePrice, currency) },
      ],
    }));
  };

  const amounts = values.rooms.map((r) => ({
    adults: num(r.adults),
    children: num(r.children),
    nightlyRate: toStoredAmount(num(r.nightlyRate), currency),
  }));
  const totals = stayTotals({
    nights,
    hours,
    rooms: amounts,
    mealPlanPrice: pricing.mealPrices[values.mealPlan] ?? 0,
    vatRate: pricing.vatRate,
    cityTax: pricing.cityTax,
  });
  const deposit = values.deposit.enabled ? toStoredAmount(num(values.deposit.amount), currency) : 0;
  const baseNight = values.rooms.reduce((sum, r) => {
    const room = roomsById.get(r.roomId);
    return sum + (room ? (types.get(room.roomTypeId)?.basePrice ?? 0) : 0);
  }, 0);

  const guest = values.guest.mode === "existing" ? data.guests.find((g) => g.id === values.guest.guestId) : undefined;
  const newGuestName = `${values.guest.draft.firstName} ${values.guest.draft.lastName}`.trim();
  const guestLabel = guest ? `${guest.firstName} ${guest.lastName}` : values.guest.mode === "new" && newGuestName ? `${newGuestName} (nouvelle fiche)` : null;

  const canContinue =
    step === "chambres"
      ? values.rooms.length > 0
      : step === "sejour"
        ? values.rooms.length > 0 && datesOk && conflicts.length === 0
        : values.guest.mode === "new" || Boolean(values.guest.guestId);

  // ----- Etape 1 : chambres -----

  const roomsStep = (
    <>
      <p className="text-sm text-muted">
        Disponibilités affichées pour le{" "}
        <span className="font-medium text-fg">{datesOk ? formatDateRange(values.checkIn, values.checkOut) : "—"}</span> ; les
        dates se précisent à l&apos;étape suivante.
      </p>
      {data.types.map((type) => {
        const rooms = data.rooms.filter((r) => r.roomTypeId === type.id);
        if (rooms.length === 0) return null;
        const free = rooms.filter((r) => !r.outOfService && !bookingOf(r.id)).length;
        return (
          <section key={type.id} className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-xl font-semibold">{type.name}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {[`${type.capacity} pers. max`, type.size ? `${type.size} m²` : null, type.bed].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="accent font-semibold">
                  {formatMoney(type.basePrice, currency)}
                  <span className="text-xs font-normal text-muted"> / nuit</span>
                </p>
                <p className="text-xs text-muted">
                  {plural(free, "libre")} sur {rooms.length}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {rooms.map((room) => {
                const booking = bookingOf(room.id);
                const upcoming = booking ? undefined : nextBooking(room.id);
                const isSelected = selected.has(room.id);
                const status = room.outOfService
                  ? { text: `Hors service${room.notes ? ` · ${room.notes}` : ""}`, tone: "text-rose-600 dark:text-rose-300" }
                  : booking
                    ? { text: `Réservée du ${formatDateRange(booking.checkIn, booking.checkOut)}`, tone: "text-amber-700 dark:text-amber-300" }
                    : {
                        text: upcoming ? `Libre · prochaine arrivée ${formatDayMonth(upcoming.checkIn)}` : "Libre",
                        tone: "text-emerald-700 dark:text-emerald-300",
                      };
                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={room.outOfService && !isSelected}
                    aria-pressed={isSelected}
                    aria-label={`Chambre ${room.number}, ${status.text}${isSelected ? ", sélectionnée" : ""}`}
                    onClick={() => toggleRoom(room.id)}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-gold-600 bg-gold-50 ring-1 ring-gold-600 dark:bg-gold-500/10"
                        : room.outOfService
                          ? "cursor-not-allowed border-dashed opacity-60"
                          : "bg-surface hover:border-gold-400"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="tabular font-serif text-xl font-semibold">{room.number}</span>
                      {isSelected ? (
                        <span className="grid size-5 place-items-center rounded-full bg-gold-700 text-white">
                          <CheckIcon className="size-3.5" />
                        </span>
                      ) : (
                        <span className="size-5 rounded-full border" aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-xs text-muted">{floorLabel(room.floor)}</span>
                    <span className={`mt-1.5 text-xs font-medium ${status.tone}`}>{status.text}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );

  // ----- Etape 2 : sejour -----

  const upcoming = data.bookings
    .filter((b) => selected.has(b.roomId) && b.checkOut > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const stayStep = (
    <>
      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Dates du séjour</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="checkIn">
              Arrivée — date et heure
            </label>
            <input
              id="checkIn"
              type="datetime-local"
              className="input"
              required
              min={`${today}T00:00`}
              value={`${values.checkIn}T${values.checkInTime}`}
              onChange={(e) => {
                const [checkIn, time] = e.target.value.split("T");
                if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn ?? "")) return;
                update((v) => ({
                  ...v,
                  checkIn,
                  checkInTime: time?.slice(0, 5) || v.checkInTime,
                  // Deplacer l'arrivee conserve la duree du sejour.
                  checkOut: addDaysToDateInput(checkIn, Math.max(0, daysBetween(v.checkIn, v.checkOut) || 0)),
                }));
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="checkOut">
              Départ — date et heure
            </label>
            <input
              id="checkOut"
              type="datetime-local"
              className="input"
              required
              min={`${values.checkIn}T${values.checkInTime}`}
              value={`${values.checkOut}T${values.checkOutTime}`}
              onChange={(e) => {
                const [checkOut, time] = e.target.value.split("T");
                if (!checkOut) return;
                update((v) => ({ ...v, checkOut, checkOutTime: time?.slice(0, 5) || v.checkOutTime }));
              }}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 5, 7].map((n) => (
                <button key={n} type="button" className={chip(daysBetween(values.checkIn, values.checkOut) === n)} onClick={() =>
                    set(
                      n === 0
                        ? { checkOut: values.checkIn, checkOutTime: addHoursToTime(values.checkInTime, 1) }
                        : { checkOut: addDaysToDateInput(values.checkIn, n) },
                    )
                  }>
                  {n === 0 ? "Heure" : plural(n, "nuit")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="source">
              Origine
            </label>
            <select
              id="source"
              className="select"
              value={values.source}
              onChange={(e) => set({ source: e.target.value as ReservationSource })}
            >
              {RESERVATION_SOURCES.filter((s) => s !== "DEVIS").map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={`mt-3 text-sm ${datesOk ? "text-muted" : "font-medium text-rose-600"}`}>
          {datesOk
            ? `${stayLength(values.checkIn, values.checkOut, values.checkInTime, values.checkOutTime)} · ${formatDateRange(values.checkIn, values.checkOut)} · arrivée à ${values.checkInTime}, départ à ${values.checkOutTime}`
            : "Le départ doit suivre l'arrivée (date et heure)."}
        </p>
        <p className="hint">
          Les nuits facturées se comptent sur les dates. Départ le jour de l&apos;arrivée : séjour à l&apos;heure, chaque heure
          entamée est facturée.
        </p>

        {pricing.plans.length > 1 && (
          <fieldset className="mt-5">
            <legend className="label">Formule de restauration</legend>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {pricing.plans.map((plan) => {
                const active = values.mealPlan === plan;
                const price = pricing.mealPrices[plan];
                return (
                  <label
                    key={plan}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500 ${
                      active ? "border-gold-600 bg-gold-50 dark:bg-gold-500/10" : "hover:border-gold-400"
                    }`}
                  >
                    <input type="radio" name="mealPlanChoice" className="sr-only" checked={active} onChange={() => set({ mealPlan: plan })} />
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {MEAL_PLAN_META[plan].label}
                      {active && <CheckIcon className="accent size-4" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {price > 0 ? `${formatMoney(price, currency)} / pers. / nuit` : MEAL_PLAN_META[plan].description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Occupants et tarifs</h2>
          <button type="submit" name="goto" value="chambres" formNoValidate className="accent text-sm font-medium hover:underline">
            Modifier les chambres
          </button>
        </div>
        <div className="table-wrap mt-4 rounded-lg border">
          <table className="data">
            <thead>
              <tr>
                <th>Chambre</th>
                <th>Adultes</th>
                <th>Enfants</th>
                <th>Tarif / {per} ({symbol})</th>
                <th className="text-right">Séjour</th>
                <th>
                  <span className="sr-only">Retirer</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {values.rooms.map((line, i) => {
                const room = roomsById.get(line.roomId);
                const type = room ? types.get(room.roomTypeId) : undefined;
                const booking = bookingOf(line.roomId);
                const over = type ? amounts[i].adults + amounts[i].children > type.capacity : false;
                const label = room?.number ?? "?";
                return (
                  <tr key={line.roomId}>
                    <td>
                      <p className="font-semibold">{label}</p>
                      <p className="text-xs text-muted">{type?.name}</p>
                      {booking && (
                        <p className="text-xs font-medium text-rose-600">
                          Déjà réservée du {formatDateRange(booking.checkIn, booking.checkOut)} ({booking.number})
                        </p>
                      )}
                      {over && <p className="text-xs font-medium text-rose-600">Capacité : {type?.capacity} pers.</p>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={type?.capacity ?? 10}
                        className="input w-20"
                        value={line.adults}
                        onChange={(e) => setRoom(line.roomId, { adults: e.target.value })}
                        aria-label={`Adultes, chambre ${label}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={type ? type.capacity - 1 : 10}
                        className="input w-20"
                        value={line.children}
                        onChange={(e) => setRoom(line.roomId, { children: e.target.value })}
                        aria-label={`Enfants, chambre ${label}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={priceStep}
                        className="input w-32"
                        value={line.nightlyRate}
                        onChange={(e) => setRoom(line.roomId, { nightlyRate: e.target.value })}
                        aria-label={`Tarif par ${per}, chambre ${label}`}
                      />
                    </td>
                    <td className="tabular whitespace-nowrap text-right font-semibold">
                      {formatMoney(units * amounts[i].nightlyRate, currency)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon hover:!text-rose-600"
                        disabled={values.rooms.length === 1}
                        onClick={() => toggleRoom(line.roomId)}
                        aria-label={`Retirer la chambre ${label}`}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {conflicts.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {conflicts.length > 1 ? `${conflicts.length} chambres ne sont pas libres` : "Une chambre n'est pas libre"} sur ces
            dates : changez les dates, ou retirez-{conflicts.length > 1 ? "les" : "la"}.
          </p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Réservations déjà prévues sur ces chambres</h2>
          <p className="mt-0.5 text-xs text-muted">Pour choisir des dates libres.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {upcoming.map((b) => {
              const clash = datesOk && staysOverlap(b, values);
              return (
                <li
                  key={`${b.roomId}-${b.number}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-1.5 ${
                    clash ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200" : "bg-surface-alt"
                  }`}
                >
                  <span>
                    Ch. {roomsById.get(b.roomId)?.number} · {formatDateRange(b.checkIn, b.checkOut)}
                  </span>
                  <span className="font-mono text-xs">
                    {b.number}
                    {clash ? " · chevauche vos dates" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );

  // ----- Etape 3 : client -----

  const clientStep = (
    <>
      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Client</h2>
        <div className="mt-4">
          <GuestPicker guests={data.guests} value={values.guest} onChange={(g) => set({ guest: g })} />
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-gold-700"
            checked={values.deposit.enabled}
            onChange={(e) => setDeposit({ enabled: e.target.checked })}
          />
          <span className="font-semibold">Encaisser un acompte maintenant</span>
        </label>
        <p className="mt-1 text-xs text-muted">Un reçu numéroté est émis à la confirmation de la réservation.</p>
        {values.deposit.enabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="depositAmount">
                Montant ({symbol})
              </label>
              <input
                id="depositAmount"
                type="number"
                min={0}
                step={priceStep}
                className="input"
                value={values.deposit.amount}
                onChange={(e) => setDeposit({ amount: e.target.value })}
              />
              <div className="mt-1.5 flex gap-1.5">
                {[30, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={chip(false)}
                    onClick={() => setDeposit({ amount: toInputAmount(Math.round((totals.total * pct) / 100), currency) })}
                  >
                    {pct} %
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="depositMethod">
                Mode de règlement
              </label>
              <select
                id="depositMethod"
                className="select"
                value={values.deposit.method}
                onChange={(e) => setDeposit({ method: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="depositReference">
                Référence
              </label>
              <input
                id="depositReference"
                className="input"
                placeholder="N° de transaction…"
                value={values.deposit.reference}
                onChange={(e) => setDeposit({ reference: e.target.value })}
              />
            </div>
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <label className="font-semibold" htmlFor="notes">
          Notes internes
        </label>
        <p className="mt-1 text-xs text-muted">Heure d&apos;arrivée, préférences, demandes particulières…</p>
        <textarea id="notes" rows={3} className="textarea mt-3" value={values.notes} onChange={(e) => set({ notes: e.target.value })} />
      </section>
    </>
  );

  // ----- Colonne de droite -----

  const recap = (
    <dl className="space-y-1.5 border-t px-5 py-4 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-muted">Chambres</dt>
        <dd className="tabular text-right font-medium">{values.rooms.map((r) => roomsById.get(r.roomId)?.number).join(", ")}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted">Dates</dt>
        <dd className="text-right">{datesOk ? formatDateRange(values.checkIn, values.checkOut) : "—"}</dd>
      </div>
      {step === "client" && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Client</dt>
          <dd className="text-right font-medium">{guestLabel ?? "À choisir"}</dd>
        </div>
      )}
      {deposit > 0 && (
        <>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Acompte</dt>
            <dd className="tabular">{formatMoney(deposit, currency)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Reste à payer</dt>
            <dd className="tabular">{formatMoney(Math.max(0, totals.total - deposit), currency)}</dd>
          </div>
        </>
      )}
    </dl>
  );

  const aside =
    step === "chambres" ? (
      <section className="card overflow-hidden">
        <div className="bg-ink-950 px-5 py-4 text-white">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gold-400">Votre sélection</p>
          <p className="mt-1 text-sm text-ink-300">{values.rooms.length ? plural(values.rooms.length, "chambre") : "Aucune chambre"}</p>
        </div>
        {values.rooms.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Cliquez sur une ou plusieurs chambres pour les ajouter.</p>
        ) : (
          <ul className="divide-y">
            {values.rooms.map((line) => {
              const room = roomsById.get(line.roomId);
              const type = room ? types.get(room.roomTypeId) : undefined;
              return (
                <li key={line.roomId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">Chambre {room?.number}</p>
                    <p className="truncate text-xs text-muted">{type?.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="tabular whitespace-nowrap text-xs">{type ? formatMoney(type.basePrice, currency) : ""}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon hover:!text-rose-600"
                      onClick={() => toggleRoom(line.roomId)}
                      aria-label={`Retirer la chambre ${room?.number}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {values.rooms.length > 0 && (
          <p className="border-t px-5 py-3 text-xs text-muted">
            Tarif de base : <span className="font-semibold text-fg">{formatMoney(baseNight, currency)}</span> par nuit, HT.
            Occupants et tarifs se règlent à l&apos;étape Séjour.
          </p>
        )}
      </section>
    ) : (
      <StaySummary
        totals={totals}
        currency={currency}
        vatRate={pricing.vatRate}
        mealLabel={MEAL_PLAN_META[values.mealPlan].label}
        footer={recap}
      />
    );

  return (
    <form
      action={action}
      onKeyDown={blockImplicitSubmit}
      onSubmit={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
      inert={!ready}
      aria-busy={!ready}
      className={`pb-4 transition-opacity ${ready ? "" : "opacity-60"}`}
    >
      <input type="hidden" name="payload" value={payload} />
      <input type="hidden" name="step" value={step} />

      <ol className="mb-5 grid gap-2 sm:grid-cols-3" aria-label="Étapes de la réservation">
        {STEPS.map((s, i) => {
          const current = s.key === step;
          const past = i < stepIndex;
          const reachable = s.key === "chambres" || (s.key === "sejour" ? progress.chambres : progress.sejour);
          const content = (
            <>
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
                  current
                    ? "border-gold-700 bg-gold-700 text-white"
                    : past
                      ? "border-gold-600 text-gold-700 dark:text-gold-300"
                      : "text-muted"
                }`}
              >
                {past ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0 text-left">
                <span className={`block text-sm font-semibold ${current ? "" : "text-muted"}`}>{s.label}</span>
                <span className="block truncate text-xs text-muted">{s.hint}</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {current || !reachable ? (
                <div
                  aria-current={current ? "step" : undefined}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    current ? "border-gold-500 bg-surface shadow-sm" : "opacity-60"
                  }`}
                >
                  {content}
                </div>
              ) : (
                <button
                  type="submit"
                  name="goto"
                  value={s.key}
                  formNoValidate
                  className="flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors hover:border-gold-400"
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {startedAt && (
        <p className="mb-5 rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-sm text-gold-900 dark:border-gold-500/30 dark:bg-gold-500/10 dark:text-gold-100">
          Réservation en cours depuis le {startedAt} : vos choix sont conservés dans votre session jusqu&apos;à la
          confirmation.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {step === "chambres" && roomsStep}
          {step === "sejour" && stayStep}
          {step === "client" && clientStep}
        </div>
        <aside className="xl:sticky xl:top-6 xl:self-start">{aside}</aside>
      </div>

      <div className="no-print sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {state?.error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            {saved === "saving" ? (
              "Enregistrement dans votre session…"
            ) : saved === "saved" ? (
              <>
                <CheckIcon className="size-3.5 text-emerald-600" /> Enregistré dans votre session
              </>
            ) : (
              "Vos choix sont conservés dans votre session."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              formAction={resetDraftAction}
              formNoValidate
              className="btn btn-ghost"
              onClick={(e) => {
                if (!window.confirm("Abandonner cette réservation ? Les choix en cours seront effacés.")) e.preventDefault();
              }}
            >
              Abandonner
            </button>
            {previous && (
              <button type="submit" name="goto" value={previous} formNoValidate className="btn btn-outline">
                <ChevronLeftIcon /> Retour
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={pending || !canContinue}>
              {pending ? (
                "Un instant…"
              ) : step === "client" ? (
                "Confirmer la réservation"
              ) : (
                <>
                  Continuer <ArrowRightIcon />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
