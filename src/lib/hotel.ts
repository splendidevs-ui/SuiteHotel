import "server-only";
import { db } from "./db";

const HOTEL_ID = "main";

/** Fiche de l'hotel (ligne unique), creee avec les valeurs par defaut si absente. */
export async function getHotel() {
  const hotel = await db.hotel.findUnique({ where: { id: HOTEL_ID } });
  return hotel ?? db.hotel.upsert({ where: { id: HOTEL_ID }, update: {}, create: { id: HOTEL_ID, name: "Mon hôtel" } });
}

export type Hotel = Awaited<ReturnType<typeof getHotel>>;
