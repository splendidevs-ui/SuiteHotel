"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { saveGuest } from "@/lib/guests";

export async function saveGuestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const guestId = field(formData, "guestId") || null;
  const result = await saveGuest(guestId, {
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    nationality: field(formData, "nationality"),
    idType: field(formData, "idType"),
    idNumber: field(formData, "idNumber"),
    company: field(formData, "company"),
    address: field(formData, "address"),
    notes: field(formData, "notes"),
    vip: formData.get("vip") === "on",
  });
  if (!result.ok) return { error: result.error };
  redirect(`/clients/${result.id}?ok=${guestId ? "modifie" : "cree"}`);
}
