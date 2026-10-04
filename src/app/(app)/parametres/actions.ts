"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { changePassword, updateHotelInfo, updateProfile, updateRates, updateRestaurant } from "@/lib/settings";

export async function saveHotelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await updateHotelInfo(user, {
    name: field(formData, "name"),
    tagline: field(formData, "tagline"),
    stars: field(formData, "stars"),
    address: field(formData, "address"),
    city: field(formData, "city"),
    country: field(formData, "country"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    website: field(formData, "website"),
    taxId: field(formData, "taxId"),
    tradeRegister: field(formData, "tradeRegister"),
    bankDetails: field(formData, "bankDetails"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/parametres?ok=hotel");
}

export async function saveRatesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await updateRates(user, {
    currency: field(formData, "currency"),
    vatRate: field(formData, "vatRate"),
    cityTax: field(formData, "cityTax"),
    checkInTime: field(formData, "checkInTime"),
    checkOutTime: field(formData, "checkOutTime"),
    quoteValidityDays: field(formData, "quoteValidityDays"),
    quoteTerms: field(formData, "quoteTerms"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/parametres?ok=tarifs");
}

export async function saveRestaurantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await updateRestaurant(user, {
    restaurantEnabled: formData.get("restaurantEnabled") === "on",
    restaurantName: field(formData, "restaurantName"),
    breakfastPrice: field(formData, "breakfastPrice"),
    halfBoardPrice: field(formData, "halfBoardPrice"),
    fullBoardPrice: field(formData, "fullBoardPrice"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/parametres?ok=restauration#restauration");
}

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await updateProfile(user, { name: field(formData, "name"), jobTitle: field(formData, "jobTitle") });
  if (!result.ok) return { error: result.error };
  redirect("/parametres?ok=profil");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await changePassword(user, {
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  redirect("/parametres?ok=motdepasse");
}
