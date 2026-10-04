"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { cancelReceipt } from "@/lib/receipts";

export async function cancelReceiptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const receiptId = field(formData, "receiptId");
  const result = await cancelReceipt(user, receiptId, field(formData, "reason"));
  if (!result.ok) return { error: result.error };
  redirect(`/recus/${receiptId}?ok=annule`);
}
