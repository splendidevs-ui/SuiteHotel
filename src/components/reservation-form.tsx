"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { updateReservationAction } from "@/app/(app)/reservations/actions";
import { MEAL_PLAN_META, RESERVATION_SOURCES, SOURCE_LABELS, type MealPlan, type ReservationSource } from "@/lib/constants";
import type { FormState } from "@/lib/form";
import { addDaysToDateInput, formatDateRange, plural } from "@/lib/format";
import { currencySymbol, formatMoney, isZeroDecimal, toInputAmount, toStoredAmount } from "@/lib/money";
import type { ReservationFormData } from "@/lib/queries";
import { guestRefPayload, type ReservationFormRoom, type ReservationFormValues } from "@/lib/schemas";
import { addHoursToTime, daysBetween, nightsBetween, stayHours, stayLength, staysOverlap, stayTotals } from "@/lib/stay-math";
import { GuestPicker } from "./guest-picker";
import { CheckIcon, TrashIcon } from "./icons";
import { StaySummary } from "./stay-summary";

function num(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type ReservationPricing = {
  currency: string;
  vatRate: number;
  cityTax: number;
  mealPrices: Record<MealPlan, number>;
  plans: MealPlan[];
};

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active ? "border-gold-600 bg-gold-50 text-gold-800 dark:bg-gold-500/15 dark:text-gold-200" : "text-muted hover:border-gold-400"
  }`;

/**
 * Modification d'une reservation confirmee, dans l'ordre du parcours de creation :
 * chambres, sejour, client. La disponibilite est calculee en direct ; le serveur la
 * reverifie a l'enregistrement.
 */
export function ReservationForm({
  initial,
  data,
  pricing,
  reservationId,
}: {
  initial: ReservationFormValues;
  data: ReservationFormData;
  pricing: ReservationPricing;
  reservationId: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateReservationAction, undefined);
  const [values, setValues] = useState<ReservationFormValues>(initial);
  const [dirty, setDirty] = useState(false);

  // Avertit avant de quitter la page avec une saisie non enregistree.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (state?.error) setDirty(true);
  }, [state]);

  // L'envoi part de l'etat React : le formulaire reste inerte tant que React n'a pas pris la main.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const update = (fn: (v: ReservationFormValues) => ReservationFormValues) => {
    setValues(fn);
    setDirty(true);
  };
  const set = (patch: Partial<ReservationFormValues>) => update((v) => ({ ...v, ...patch }));
  const setRoom = (roomId: string, patch: Partial<ReservationFormRoom>) =>
    update((v) => ({ ...v, rooms: v.rooms.map((r) => (r.roomId === roomId ? { ...r, ...patch } : r)) }));

  const { currency } = pricing;
  const symbol = currencySymbol(currency);
  const priceStep = isZeroDecimal(currency) ? "1" : "0.01";
  const types = useMemo(() => new Map(data.types.map((t) => [t.id, t])), [data.types]);
  const roomsById = useMemo(() => new Map(data.rooms.map((r) => [r.id, r])), [data.rooms]);

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
  const selected = new Set(values.rooms.map((r) => r.roomId));

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

  const payload = useMemo(
    () =>
      JSON.stringify({
        guest: guestRefPayload(values.guest),
        checkIn: values.checkIn,
        checkInTime: values.checkInTime,
        checkOut: values.checkOut,
        checkOutTime: values.checkOutTime,
        mealPlan: values.mealPlan,
        source: values.source,
        notes: values.notes,
        rooms: values.rooms,
        deposit: null,
      }),
    [values],
  );

  return (
    <form
      action={action}
      onSubmit={() => setDirty(false)}
      inert={!ready}
      aria-busy={!ready}
      className={`pb-4 transition-opacity ${ready ? "" : "opacity-60"}`}
    >
      <input type="hidden" name="payload" value={payload} />
      <input type="hidden" name="reservationId" value={reservationId} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">1. Chambres</h2>
              <span className="text-xs text-muted">Cliquez sur les numéros libres pour les ajouter.</span>
            </div>
            <div className="mt-4 space-y-3">
              {data.types.map((type) => {
                const rooms = data.rooms.filter((r) => r.roomTypeId === type.id);
                if (rooms.length === 0) return null;
                const free = rooms.filter((r) => !r.outOfService && !bookingOf(r.id)).length;
                return (
                  <div key={type.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">
                        {type.name}{" "}
                        <span className="text-xs font-normal text-muted">
                          · {type.capacity} pers. max{type.size ? ` · ${type.size} m²` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        <span className="font-semibold text-fg">{formatMoney(type.basePrice, currency)}</span> / nuit ·{" "}
                        {datesOk ? plural(free, "libre") : "—"}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {rooms.map((room) => {
                        const booking = bookingOf(room.id);
                        const isSelected = selected.has(room.id);
                        const blocked = room.outOfService || (!!booking && !isSelected);
                        const title = room.outOfService
                          ? `Hors service${room.notes ? ` : ${room.notes}` : ""}`
                          : booking
                            ? `Déjà réservée (${booking.number})`
                            : isSelected
                              ? "Retirer de la réservation"
                              : "Ajouter à la réservation";
                        const tone = isSelected
                          ? booking
                            ? "border-rose-600 bg-rose-600 text-white"
                            : "border-gold-700 bg-gold-700 text-white"
                          : blocked
                            ? "cursor-not-allowed border-dashed text-muted line-through opacity-60"
                            : "bg-surface hover:border-gold-500 hover:text-gold-800 dark:hover:text-gold-200";
                        return (
                          <button
                            key={room.id}
                            type="button"
                            disabled={(blocked && !isSelected) || (!datesOk && !isSelected)}
                            title={title}
                            aria-label={`Chambre ${room.number} : ${title}`}
                            aria-pressed={isSelected}
                            onClick={() => toggleRoom(room.id)}
                            className={`tabular min-w-12 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors ${tone}`}
                          >
                            {room.number}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {values.rooms.length > 0 && (
              <div className="table-wrap mt-5 rounded-lg border">
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
                            {booking && <p className="text-xs font-medium text-rose-600">Occupée sur ces dates ({booking.number})</p>}
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
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">2. Séjour</h2>
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
                    <button
                      key={n}
                      type="button"
                      className={chip(daysBetween(values.checkIn, values.checkOut) === n)}
                      onClick={() =>
                    set(
                      n === 0
                        ? { checkOut: values.checkIn, checkOutTime: addHoursToTime(values.checkInTime, 1) }
                        : { checkOut: addDaysToDateInput(values.checkIn, n) },
                    )
                  }
                    >
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
                  {RESERVATION_SOURCES.filter((s) => s !== "DEVIS" || values.source === "DEVIS").map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={`mt-3 text-sm ${datesOk ? "text-muted" : "font-medium text-rose-600"}`}>
              {datesOk
                ? `${stayLength(values.checkIn, values.checkOut, values.checkInTime, values.checkOutTime)} · ${formatDateRange(values.checkIn, values.checkOut)}`
                : "Le départ doit suivre l'arrivée (date et heure)."}
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
                        <input
                          type="radio"
                          name="mealPlanChoice"
                          className="sr-only"
                          checked={active}
                          onChange={() => set({ mealPlan: plan })}
                        />
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
            <h2 className="font-semibold">3. Client</h2>
            <div className="mt-4">
              <GuestPicker guests={data.guests} value={values.guest} onChange={(guest) => set({ guest })} />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <label className="font-semibold" htmlFor="notes">
              Notes internes
            </label>
            <p className="mt-1 text-xs text-muted">Heure d&apos;arrivée, préférences, demandes particulières…</p>
            <textarea
              id="notes"
              rows={3}
              className="textarea mt-3"
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </section>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <StaySummary totals={totals} currency={currency} vatRate={pricing.vatRate} mealLabel={MEAL_PLAN_META[values.mealPlan].label} />
        </aside>
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
          <p className="text-sm text-muted">
            {values.rooms.length > 0
              ? `${plural(values.rooms.length, "chambre")} · ${formatMoney(totals.total, currency)} TTC`
              : "Aucune chambre sélectionnée"}
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/reservations/${reservationId}`} className="btn btn-outline">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary" disabled={pending || values.rooms.length === 0}>
              {pending ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
