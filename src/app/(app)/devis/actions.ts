"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { changeQuoteStatus, convertQuote, createQuote, deleteQuote, updateQuote } from "@/lib/quotes";

export async function saveQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Le formulaire est incomplet. Rechargez la page et réessayez." };
  }

  const quoteId = field(formData, "quoteId");
  if (quoteId) {
    const result = await updateQuote(user, quoteId, payload);
    if (!result.ok) return { error: result.error };
    redirect(`/devis/${quoteId}?ok=modifie`);
  }
  const result = await createQuote(user, payload);
  if (!result.ok) return { error: result.error };
  redirect(`/devis/${result.id}?ok=cree`);
}

export async function changeQuoteStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const quoteId = field(formData, "quoteId");
  const result = await changeQuoteStatus(user, quoteId, field(formData, "to"));
  if (!result.ok) return { error: result.error };
  redirect(`/devis/${quoteId}?ok=statut`);
}

/** Devis accepte : cree la reservation (chambres attribuees) et l'ouvre. */
export async function convertQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await convertQuote(user, field(formData, "quoteId"));
  if (!result.ok) return { error: result.error };
  redirect(`/reservations/${result.id}?ok=creee`);
}

export async function deleteQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteQuote(user, field(formData, "quoteId"));
  if (!result.ok) return { error: result.error };
  redirect("/devis?ok=supprime");
}
