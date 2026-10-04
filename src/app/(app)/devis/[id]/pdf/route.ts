import { getCurrentUser } from "@/lib/auth";
import { mealPlanLabel } from "@/lib/constants";
import { pdfGuest, pdfResponse } from "@/lib/documents";
import { quoteLines } from "@/lib/folio";
import { getHotel } from "@/lib/hotel";
import { generateQuotePdf } from "@/lib/pdf";
import { getQuote } from "@/lib/queries";
import { nightsBetween } from "@/lib/stay-math";

/** Devis en PDF (ajouter ?apercu pour l'ouvrir dans le navigateur). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Authentification requise.", { status: 401 });

  const { id } = await params;
  const [hotel, quote] = await Promise.all([getHotel(), getQuote(id)]);
  if (!quote) return new Response("Devis introuvable.", { status: 404 });

  const pdf = await generateQuotePdf({
    hotel,
    quote: {
      ...quote,
      nights: nightsBetween(quote.checkIn, quote.checkOut),
      mealPlanLabel: mealPlanLabel(quote.mealPlan),
      roomCount: quote.rooms.reduce((s, r) => s + r.quantity, 0),
      persons: quote.rooms.reduce((s, r) => s + r.quantity * (r.adults + r.children), 0),
    },
    guest: pdfGuest(quote.guest),
    lines: quoteLines(quote),
    author: quote.createdBy,
  });
  return pdfResponse(pdf, `${quote.number}.pdf`, request);
}
