"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import {
  addOrderItem,
  cancelOrder,
  changeOrderLine,
  chargeOrderToRoom,
  createOrder,
  deleteMenuItem,
  payOrder,
  saveMenuItem,
  toggleMenuItem,
} from "@/lib/restaurant";

export async function createOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await createOrder(user, {
    tableLabel: field(formData, "tableLabel"),
    covers: field(formData, "covers"),
    reservationId: field(formData, "reservationId"),
    guestName: field(formData, "guestName"),
    notes: field(formData, "notes"),
  });
  if (!result.ok) return { error: result.error };
  redirect(`/restaurant/commandes/${result.id}`);
}

/** Ajout d'un plat : la page de l'addition est rafraichie sans navigation. */
export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const orderId = field(formData, "orderId");
  const result = await addOrderItem(user, orderId, field(formData, "menuItemId"));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/restaurant/commandes/${orderId}`);
  return {};
}

export async function changeLineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await changeOrderLine(user, field(formData, "lineId"), Number(field(formData, "delta")) || 0);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/restaurant/commandes/${result.id}`);
  return {};
}

export async function chargeToRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const orderId = field(formData, "orderId");
  const result = await chargeOrderToRoom(user, orderId, field(formData, "reservationId"));
  if (!result.ok) return { error: result.error };
  redirect(`/restaurant/commandes/${orderId}?ok=imputee`);
}

export async function payOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await payOrder(user, field(formData, "orderId"), {
    method: field(formData, "method"),
    reference: field(formData, "reference"),
    payerName: field(formData, "payerName"),
  });
  if (!result.ok) return { error: result.error };
  redirect(`/recus/${result.receiptId}?ok=emis`);
}

export async function cancelOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await cancelOrder(user, field(formData, "orderId"));
  if (!result.ok) return { error: result.error };
  redirect("/restaurant?ok=annulee");
}

export async function saveMenuItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await saveMenuItem(user, field(formData, "itemId") || null, {
    name: field(formData, "name"),
    category: field(formData, "category"),
    description: field(formData, "description"),
    price: field(formData, "price"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/restaurant/carte?ok=enregistre");
}

export async function toggleMenuItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await toggleMenuItem(user, field(formData, "itemId"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/restaurant/carte");
  return {};
}

export async function deleteMenuItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteMenuItem(user, field(formData, "itemId"));
  if (!result.ok) return { error: result.error };
  redirect("/restaurant/carte?ok=supprime");
}
