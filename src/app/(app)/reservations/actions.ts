"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { recordPayment } from "@/lib/receipts";
import {
  addCharge,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  removeCharge,
  updateReservation,
} from "@/lib/reservations";

const INCOMPLETE = "Le formulaire est incomplet. Rechargez la page et réessayez.";

function payloadOf(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return null;
  }
}

/** Modification d'une reservation confirmee (la creation passe par le parcours en etapes). */
export async function updateReservationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const payload = payloadOf(formData);
  if (!payload) return { error: INCOMPLETE };
  const reservationId = field(formData, "reservationId");
  const result = await updateReservation(user, reservationId, payload);
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${reservationId}?ok=modifiee`);
}

export async function checkInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reservationId = field(formData, "reservationId");
  const result = await checkInReservation(user, reservationId);
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${reservationId}?ok=arrivee`);
}

export async function checkOutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reservationId = field(formData, "reservationId");
  const result = await checkOutReservation(user, reservationId);
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${reservationId}?ok=depart`);
}

export async function cancelReservationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reservationId = field(formData, "reservationId");
  const result = await cancelReservation(user, reservationId, field(formData, "reason"));
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${reservationId}?ok=annulee`);
}

export async function addChargeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reservationId = field(formData, "reservationId");
  const result = await addCharge(user, reservationId, {
    designation: field(formData, "designation"),
    quantity: field(formData, "quantity"),
    unitPrice: field(formData, "unitPrice"),
    date: field(formData, "date"),
  });
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${reservationId}?ok=prestation`);
}

export async function removeChargeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await removeCharge(user, field(formData, "chargeId"));
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${result.id}?ok=retiree`);
}

/** Encaissement : ouvre directement le recu emis, pret a imprimer. */
export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await recordPayment(user, field(formData, "reservationId"), {
    amount: field(formData, "amount"),
    method: field(formData, "method"),
    reference: field(formData, "reference"),
    payerName: field(formData, "payerName"),
  });
  if (!result.ok) return { error: result.error };
  redirect(`/recus/${result.id}?ok=emis`);
}
