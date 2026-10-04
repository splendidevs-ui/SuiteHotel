"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { field, type FormState } from "@/lib/form";
import { deleteRoom, saveRoom, saveRoomType, setOutOfService } from "@/lib/rooms";

export async function saveRoomTypeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await saveRoomType(user, field(formData, "typeId") || null, {
    name: field(formData, "name"),
    description: field(formData, "description"),
    capacity: field(formData, "capacity"),
    basePrice: field(formData, "basePrice"),
    size: field(formData, "size"),
    bed: field(formData, "bed"),
    amenities: field(formData, "amenities"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/chambres?ok=categorie#categories");
}

export async function saveRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await saveRoom(user, field(formData, "roomId") || null, {
    number: field(formData, "number"),
    floor: field(formData, "floor"),
    roomTypeId: field(formData, "roomTypeId"),
  });
  if (!result.ok) return { error: result.error };
  redirect("/chambres?ok=chambre");
}

export async function setServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await setOutOfService(
    user,
    field(formData, "roomId"),
    field(formData, "outOfService") === "1",
    field(formData, "notes"),
  );
  if (!result.ok) return { error: result.error };
  redirect("/chambres?ok=service");
}

export async function deleteRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteRoom(user, field(formData, "roomId"));
  if (!result.ok) return { error: result.error };
  redirect("/chambres?ok=supprimee");
}
