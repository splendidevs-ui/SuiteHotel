import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QuoteForm } from "@/components/quote-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isMealPlan, isQuoteEditable, mealPriceTable, offeredMealPlans } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { formatQuantity, toInputAmount } from "@/lib/money";
import { getQuote, getReservationFormData } from "@/lib/queries";
import { EMPTY_GUEST, type QuoteFormValues } from "@/lib/schemas";

export const metadata: Metadata = { title: "Modifier le devis" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [hotel, quote, data] = await Promise.all([getHotel(), getQuote(id), getReservationFormData()]);
  if (!quote) notFound();
  if (quote.reservation || !isQuoteEditable(quote.status)) redirect(`/devis/${id}`);

  const cur = hotel.currency;
  const mealPlan = isMealPlan(quote.mealPlan) ? quote.mealPlan : "CHAMBRE_SEULE";
  const prices = mealPriceTable(hotel);

  const initial: QuoteFormValues = {
    guest: { mode: "existing", guestId: quote.guestId, draft: EMPTY_GUEST },
    checkIn: toDateInput(quote.checkIn),
    checkOut: toDateInput(quote.checkOut),
    mealPlan,
    issueDate: toDateInput(quote.issueDate),
    validUntil: toDateInput(quote.validUntil),
    notes: quote.notes ?? "",
    rooms: quote.rooms.map((r) => ({
      key: r.id,
      roomTypeId: r.roomTypeId,
      quantity: String(r.quantity),
      adults: String(r.adults),
      children: String(r.children),
      nightlyRate: toInputAmount(r.nightlyRate, cur),
    })),
    extras: quote.extras.map((e) => ({
      key: e.id,
      designation: e.designation,
      quantity: formatQuantity(e.quantity).replace(/\s/g, ""),
      unitPrice: toInputAmount(e.unitPrice, cur),
    })),
  };

  return (
    <>
      <PageHeader
        back={{ href: `/devis/${id}`, label: quote.number }}
        eyebrow={`Devis ${quote.number}`}
        title="Modifier le devis"
        description="Les montants sont recalculés avec les tarifs et taxes actuels de l'hôtel."
      />
      <QuoteForm
        initial={initial}
        data={data}
        quoteId={id}
        pricing={{
          currency: cur,
          vatRate: hotel.vatRate,
          cityTax: hotel.cityTax,
          mealPrices: prices,
          plans: offeredMealPlans(hotel.restaurantEnabled, prices, mealPlan),
        }}
      />
    </>
  );
}
