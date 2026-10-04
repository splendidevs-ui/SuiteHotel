import { NextResponse } from "next/server";
import { getCurrentUser, readSessionDraft, writeSessionDraft } from "@/lib/auth";
import { applyRoomsStep } from "@/lib/booking";
import { newBookingDraft, parseDraft, withProgress } from "@/lib/booking-draft";
import { db } from "@/lib/db";
import { addDaysToDateInput, parseDateInput, todayDateInput } from "@/lib/format";

/**
 * Alimente la reservation en cours (session) puis ouvre le parcours :
 *   ?chambre=…&arrivee=…   depuis une case libre du planning -> etape Sejour
 *   ?client=…              depuis une fiche client -> etape Chambres
 * Appelee par un lien simple (<a>), jamais prechargee par le routeur.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await getCurrentUser())) return NextResponse.redirect(new URL("/connexion", url));

  const today = todayDateInput();
  const current = parseDraft(await readSessionDraft()) ?? newBookingDraft(today);
  let next = { ...current, rooms: [...current.rooms], guest: { ...current.guest } };

  const roomId = url.searchParams.get("chambre");
  const arrival = url.searchParams.get("arrivee");
  const guestId = url.searchParams.get("client");

  if (roomId && !next.rooms.some((r) => r.roomId === roomId)) {
    next.rooms.push({ roomId, adults: "", children: "0", nightlyRate: "" });
  }
  if (arrival && parseDateInput(arrival) && arrival >= today) {
    next.checkIn = arrival;
    if (next.checkOut < arrival) next.checkOut = addDaysToDateInput(arrival, 1);
  }
  if (guestId && (await db.guest.findUnique({ where: { id: guestId }, select: { id: true } }))) {
    next.guest = { ...next.guest, mode: "existing", guestId };
  }
  next = withProgress(current, next);

  // Chambre choisie depuis le planning : validee comme a l'etape 1, on passe directement au sejour.
  let target = "/reservations/nouvelle";
  if (roomId) {
    const checked = await applyRoomsStep(next);
    if (checked.ok) {
      next = checked.draft;
      target = "/reservations/nouvelle?etape=sejour";
    } else {
      next = { ...next, rooms: next.rooms.filter((r) => r.roomId !== roomId) };
    }
  }

  await writeSessionDraft(JSON.stringify(next));
  return NextResponse.redirect(new URL(target, url));
}
