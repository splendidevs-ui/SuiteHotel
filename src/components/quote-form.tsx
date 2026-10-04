"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveQuoteAction } from "@/app/(app)/devis/actions";
import { EXTRA_SUGGESTIONS, MEAL_PLAN_META } from "@/lib/constants";
import type { FormState } from "@/lib/form";
import { addDaysToDateInput, formatDateRange, plural } from "@/lib/format";
import { currencySymbol, formatMoney, isZeroDecimal, toInputAmount, toStoredAmount } from "@/lib/money";
import type { ReservationFormData } from "@/lib/queries";
import { guestRefPayload, type QuoteFormExtra, type QuoteFormRoom, type QuoteFormValues } from "@/lib/schemas";
import { daysBetween, lineAmount, nightsBetween, stayLength, staysOverlap, stayTotals } from "@/lib/stay-math";
import { GuestPicker } from "./guest-picker";
import { CheckIcon, PlusIcon, TrashIcon } from "./icons";
import type { ReservationPricing } from "./reservation-form";
import { StaySummary } from "./stay-summary";

function num(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

let counter = 0;
const newKey = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`;

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active ? "border-gold-600 bg-gold-50 text-gold-800 dark:bg-gold-500/15 dark:text-gold-200" : "text-muted hover:border-gold-400"
  }`;

/**
 * Devis de sejour, par categorie de chambre. La disponibilite affichee est indicative :
 * elle est reverifiee quand le devis est transforme en reservation.
 */
export function QuoteForm({
  initial,
  data,
  pricing,
  quoteId,
}: {
  initial: QuoteFormValues;
  data: ReservationFormData;
  pricing: ReservationPricing;
  quoteId?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveQuoteAction, undefined);
  const [values, setValues] = useState<QuoteFormValues>(initial);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (state?.error) setDirty(true);
  }, [state]);

  const update = (fn: (v: QuoteFormValues) => QuoteFormValues) => {
    setValues(fn);
    setDirty(true);
  };
  const set = (patch: Partial<QuoteFormValues>) => update((v) => ({ ...v, ...patch }));
  const setRoom = (key: string, patch: Partial<QuoteFormRoom>) =>
    update((v) => ({ ...v, rooms: v.rooms.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const setExtra = (key: string, patch: Partial<QuoteFormExtra>) =>
    update((v) => ({ ...v, extras: v.extras.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const { currency } = pricing;
  const symbol = currencySymbol(currency);
  const priceStep = isZeroDecimal(currency) ? "1" : "0.01";
  const typesById = useMemo(() => new Map(data.types.map((t) => [t.id, t])), [data.types]);
  const nights = nightsBetween(values.checkIn, values.checkOut);
  const datesOk = nights >= 1;

  const freeByType = useMemo(() => {
    const free = new Map<string, number>();
    if (!datesOk) return free;
    for (const room of data.rooms) {
      if (room.outOfService) continue;
      const busy = data.bookings.some(
        (b) => b.roomId === room.id && staysOverlap(b, values),
      );
      if (!busy) free.set(room.roomTypeId, (free.get(room.roomTypeId) ?? 0) + 1);
    }
    return free;
  }, [data.rooms, data.bookings, values.checkIn, values.checkOut, datesOk]);

  const roomAmounts = values.rooms.map((r) => ({
    quantity: Math.max(0, Math.round(num(r.quantity))),
    adults: num(r.adults),
    children: num(r.children),
    nightlyRate: toStoredAmount(num(r.nightlyRate), currency),
  }));
  const extraAmounts = values.extras.map((e) => lineAmount(num(e.quantity), toStoredAmount(num(e.unitPrice), currency)));
  const totals = stayTotals({
    nights,
    rooms: roomAmounts,
    mealPlanPrice: pricing.mealPrices[values.mealPlan] ?? 0,
    extras: extraAmounts.reduce((a, b) => a + b, 0),
    vatRate: pricing.vatRate,
    cityTax: pricing.cityTax,
  });

  const requestedByType = new Map<string, number>();
  values.rooms.forEach((r, i) => requestedByType.set(r.roomTypeId, (requestedByType.get(r.roomTypeId) ?? 0) + roomAmounts[i].quantity));

  const addRoom = () => {
    const used = new Set(values.rooms.map((r) => r.roomTypeId));
    const type = data.types.find((t) => !used.has(t.id)) ?? data.types[0];
    update((v) => ({
      ...v,
      rooms: [
        ...v.rooms,
        {
          key: newKey("r"),
          roomTypeId: type?.id ?? "",
          quantity: "1",
          adults: String(Math.min(2, type?.capacity ?? 2)),
          children: "0",
          nightlyRate: type ? toInputAmount(type.basePrice, currency) : "",
        },
      ],
    }));
  };

  const changeType = (key: string, typeId: string) => {
    const type = typesById.get(typeId);
    setRoom(key, {
      roomTypeId: typeId,
      nightlyRate: type ? toInputAmount(type.basePrice, currency) : "",
      adults: String(Math.min(2, type?.capacity ?? 2)),
      children: "0",
    });
  };

  const addExtra = (designation = "") =>
    update((v) => ({ ...v, extras: [...v.extras, { key: newKey("e"), designation, quantity: "1", unitPrice: "" }] }));

  const payload = useMemo(
    () =>
      JSON.stringify({
        guest: guestRefPayload(values.guest),
        checkIn: values.checkIn,
        checkOut: values.checkOut,
        mealPlan: values.mealPlan,
        issueDate: values.issueDate,
        validUntil: values.validUntil,
        notes: values.notes,
        rooms: values.rooms.map(({ key: _key, ...r }) => r),
        extras: values.extras.map(({ key: _key, ...e }) => e),
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
      <input type="hidden" name="quoteId" value={quoteId ?? ""} />
      <datalist id="extras-suggestions">
        {EXTRA_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">Client</h2>
            <div className="mt-4">
              <GuestPicker guests={data.guests} value={values.guest} onChange={(guest) => set({ guest })} />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">Séjour envisagé</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="checkIn">
                  Arrivée
                </label>
                <input
                  id="checkIn"
                  type="date"
                  className="input"
                  required
                  value={values.checkIn}
                  onChange={(e) => {
                    const checkIn = e.target.value;
                    update((v) => ({ ...v, checkIn, checkOut: v.checkOut >= checkIn ? v.checkOut : addDaysToDateInput(checkIn, 1) }));
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="checkOut">
                  Départ
                </label>
                <input
                  id="checkOut"
                  type="date"
                  className="input"
                  required
                  min={values.checkIn}
                  value={values.checkOut}
                  onChange={(e) => set({ checkOut: e.target.value })}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 5, 7].map((n) => (
                    <button key={n} type="button" className={chip(daysBetween(values.checkIn, values.checkOut) === n)} onClick={() => set({ checkOut: addDaysToDateInput(values.checkIn, n) })}>
                      {n === 0 ? "Journée" : plural(n, "nuit")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className={`mt-3 text-sm ${datesOk ? "text-muted" : "font-medium text-rose-600"}`}>
              {datesOk
                ? `${stayLength(values.checkIn, values.checkOut)} · ${formatDateRange(values.checkIn, values.checkOut)}`
                : "La date de départ doit suivre la date d'arrivée."}
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
              <h2 className="font-semibold">Hébergement</h2>
              <span className="text-xs text-muted">Par catégorie ; les numéros de chambre sont attribués à la réservation.</span>
            </div>
            <div className="table-wrap mt-4 rounded-lg border">
              <table className="data">
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Chambres</th>
                    <th>Adultes / ch.</th>
                    <th>Enfants / ch.</th>
                    <th>Tarif / nuit ({symbol})</th>
                    <th className="text-right">Total</th>
                    <th>
                      <span className="sr-only">Retirer</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {values.rooms.map((line, i) => {
                    const type = typesById.get(line.roomTypeId);
                    const free = freeByType.get(line.roomTypeId) ?? 0;
                    const requested = requestedByType.get(line.roomTypeId) ?? 0;
                    const over = type ? roomAmounts[i].adults + roomAmounts[i].children > type.capacity : false;
                    return (
                      <tr key={line.key}>
                        <td className="min-w-48">
                          <select
                            className="select"
                            value={line.roomTypeId}
                            onChange={(e) => changeType(line.key, e.target.value)}
                            aria-label={`Catégorie, ligne ${i + 1}`}
                          >
                            {data.types.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          {datesOk && type && (
                            <p
                              className={`mt-1 text-xs font-medium ${
                                free === 0
                                  ? "text-rose-600"
                                  : requested > free
                                    ? "text-amber-700 dark:text-amber-300"
                                    : "text-emerald-700 dark:text-emerald-300"
                              }`}
                            >
                              {free === 0 ? "Complet sur ces dates" : `${plural(free, "chambre libre", "chambres libres")} sur ces dates`}
                            </p>
                          )}
                          {over && <p className="text-xs font-medium text-rose-600">Capacité : {type?.capacity} pers. par chambre</p>}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            className="input w-20"
                            value={line.quantity}
                            onChange={(e) => setRoom(line.key, { quantity: e.target.value })}
                            aria-label={`Nombre de chambres, ligne ${i + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={type?.capacity ?? 10}
                            className="input w-20"
                            value={line.adults}
                            onChange={(e) => setRoom(line.key, { adults: e.target.value })}
                            aria-label={`Adultes par chambre, ligne ${i + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={type ? type.capacity - 1 : 10}
                            className="input w-20"
                            value={line.children}
                            onChange={(e) => setRoom(line.key, { children: e.target.value })}
                            aria-label={`Enfants par chambre, ligne ${i + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={priceStep}
                            className="input w-32"
                            value={line.nightlyRate}
                            onChange={(e) => setRoom(line.key, { nightlyRate: e.target.value })}
                            aria-label={`Tarif par nuit, ligne ${i + 1}`}
                          />
                        </td>
                        <td className="tabular whitespace-nowrap text-right font-semibold">
                          {formatMoney(roomAmounts[i].quantity * nights * roomAmounts[i].nightlyRate, currency)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon hover:!text-rose-600"
                            disabled={values.rooms.length === 1}
                            onClick={() => update((v) => ({ ...v, rooms: v.rooms.filter((r) => r.key !== line.key) }))}
                            aria-label={`Retirer la ligne ${i + 1}`}
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
            <button type="button" className="btn btn-outline mt-4" onClick={addRoom} disabled={data.types.length === 0}>
              <PlusIcon /> Ajouter une catégorie
            </button>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Prestations</h2>
              <span className="text-xs text-muted">Prix hors taxes, en {symbol}</span>
            </div>
            {values.extras.length > 0 && (
              <div className="table-wrap mt-4 rounded-lg border">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Qté</th>
                      <th>P.U. HT</th>
                      <th className="text-right">Total</th>
                      <th>
                        <span className="sr-only">Retirer</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.extras.map((extra, i) => (
                      <tr key={extra.key}>
                        <td className="min-w-56">
                          <input
                            className="input"
                            list="extras-suggestions"
                            required
                            value={extra.designation}
                            onChange={(e) => setExtra(extra.key, { designation: e.target.value })}
                            aria-label={`Désignation, prestation ${i + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="input w-20"
                            value={extra.quantity}
                            onChange={(e) => setExtra(extra.key, { quantity: e.target.value })}
                            aria-label={`Quantité, prestation ${i + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={priceStep}
                            className="input w-32"
                            value={extra.unitPrice}
                            onChange={(e) => setExtra(extra.key, { unitPrice: e.target.value })}
                            aria-label={`Prix unitaire, prestation ${i + 1}`}
                          />
                        </td>
                        <td className="tabular whitespace-nowrap text-right font-semibold">{formatMoney(extraAmounts[i], currency)}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon hover:!text-rose-600"
                            onClick={() => update((v) => ({ ...v, extras: v.extras.filter((e) => e.key !== extra.key) }))}
                            aria-label={`Retirer la prestation ${i + 1}`}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline" onClick={() => addExtra()}>
                <PlusIcon /> Ajouter une prestation
              </button>
              {EXTRA_SUGGESTIONS.slice(0, 5).map((s) => (
                <button key={s} type="button" className={chip(false)} onClick={() => addExtra(s)}>
                  + {s}
                </button>
              ))}
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">Devis</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="issueDate">
                  Date d&apos;émission
                </label>
                <input id="issueDate" type="date" className="input" required value={values.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="validUntil">
                  Valable jusqu&apos;au
                </label>
                <input
                  id="validUntil"
                  type="date"
                  className="input"
                  required
                  min={values.issueDate}
                  value={values.validUntil}
                  onChange={(e) => set({ validUntil: e.target.value })}
                />
                <div className="mt-1.5 flex gap-1.5">
                  {[7, 15, 30].map((days) => (
                    <button key={days} type="button" className={chip(false)} onClick={() => set({ validUntil: addDaysToDateInput(values.issueDate, days) })}>
                      {days} j
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">
                  Conditions
                </label>
                <textarea
                  id="notes"
                  rows={5}
                  className="textarea"
                  value={values.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  placeholder="Acompte, annulation, heures d'arrivée et de départ…"
                />
                <p className="hint">Imprimées en bas du devis.</p>
              </div>
            </div>
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
            {plural(totals.roomCount, "chambre")} · {formatMoney(totals.total, currency)} TTC
          </p>
          <div className="flex items-center gap-2">
            <Link href={quoteId ? `/devis/${quoteId}` : "/devis"} className="btn btn-outline">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary" disabled={pending || values.rooms.length === 0}>
              {pending ? "Enregistrement…" : quoteId ? "Enregistrer les modifications" : "Créer le devis"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
