"use server";

import { redirect } from "next/navigation";
import { requireDirection } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff } from "@/lib/staff";

export async function createStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDirection();
  const result = await createStaff(user, {
    name: field(formData, "name"),
    email: field(formData, "email"),
    role: field(formData, "role"),
    jobTitle: field(formData, "jobTitle"),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  redirect("/equipe?ok=cree");
}

export async function updateStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDirection();
  const result = await updateStaff(user, field(formData, "userId"), {
    name: field(formData, "name"),
    role: field(formData, "role"),
    jobTitle: field(formData, "jobTitle"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/equipe?ok=modifie");
}

export async function toggleStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDirection();
  const result = await setStaffActive(user, field(formData, "userId"), field(formData, "active") === "1");
  if (!result.ok) return { error: result.error };
  redirect("/equipe?ok=statut");
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDirection();
  const result = await resetStaffPassword(user, field(formData, "userId"), String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/equipe?ok=motdepasse");
}
