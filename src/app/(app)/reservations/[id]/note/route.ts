import { getCurrentUser } from "@/lib/auth";
import { mealPlanLabel } from "@/lib/constants";
import { pdfGuest, pdfResponse, roomsLabel } from "@/lib/documents";
import { getFolio } from "@/lib/folio";
import { getHotel } from "@/lib/hotel";
import { generateFolioPdf } from "@/lib/pdf";

/** Note de sejour en PDF (ajouter ?apercu pour l'ouvrir dans le navigateur). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Authentification requise.", { status: 401 });

  const { id } = await params;
  const [hotel, folio] = await Promise.all([getHotel(), getFolio(id)]);
  if (!folio) return new Response("Réservation introuvable.", { status: 404 });
  const r = folio.reservation;

  const pdf = await generateFolioPdf({
    hotel,
    reservation: {
      number: r.number,
      checkIn: r.checkIn,
      checkInTime: r.checkInTime,
      checkOut: r.checkOut,
      checkOutTime: r.checkOutTime,
      length: folio.length,
      mealPlanLabel: mealPlanLabel(r.mealPlan),
      roomsLabel: roomsLabel(r.rooms),
      persons: folio.totals.persons,
      currency: r.currency,
      vatRate: r.vatRate,
    },
    guest: pdfGuest(r.guest),
    lines: folio.lines,
    totals: folio.totals,
    paid: folio.paid,
    balance: folio.balance,
    receipts: r.receipts.map((x) => ({
      number: x.number,
      paidAt: x.paidAt,
      method: x.method,
      amount: x.amount,
      cancelled: Boolean(x.cancelledAt),
    })),
    issuedAt: new Date(),
  });
  return pdfResponse(pdf, `Note-${r.number}.pdf`, request);
}
