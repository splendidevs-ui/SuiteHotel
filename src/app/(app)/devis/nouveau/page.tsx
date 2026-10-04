import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { mealPriceTable, offeredMealPlans } from "@/lib/constants";
import { addDaysToDateInput, todayDateInput } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { toInputAmount } from "@/lib/money";
import { getReservationFormData } from "@/lib/queries";
import { EMPTY_GUEST, type QuoteFormValues } from "@/lib/schemas";

export const metadata: Metadata = { title: "Nouveau devis" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser();
  const { client } = await searchParams;
  const [hotel, data] = await Promise.all([getHotel(), getReservationFormData()]);
  const today = todayDateInput();
  const checkIn = addDaysToDateInput(today, 7);
  const type = data.types[0];
  const guest = data.guests.find((g) => g.id === client);
  const prices = mealPriceTable(hotel);

  const initial: QuoteFormValues = {
    guest: { mode: guest || data.guests.length > 0 ? "existing" : "new", guestId: guest?.id ?? "", draft: EMPTY_GUEST },
    checkIn,
    checkOut: addDaysToDateInput(checkIn, 2),
    mealPlan: "CHAMBRE_SEULE",
    issueDate: today,
    validUntil: addDaysToDateInput(today, hotel.quoteValidityDays),
    notes: hotel.quoteTerms ?? "",
    rooms: type
      ? [
          {
            key: "r-0",
            roomTypeId: type.id,
            quantity: "1",
            adults: String(Math.min(2, type.capacity)),
            children: "0",
            nightlyRate: toInputAmount(type.basePrice, hotel.currency),
          },
        ]
      : [],
    extras: [],
  };

  return (
    <>
      <PageHeader
        back={{ href: "/devis", label: "Devis" }}
        eyebrow="Nouveau devis"
        title="Proposer un séjour"
        description="Le client reçoit un devis détaillé ; à son accord, il devient une réservation en un clic."
      />
      <QuoteForm
        initial={initial}
        data={data}
        pricing={{
          currency: hotel.currency,
          vatRate: hotel.vatRate,
          cityTax: hotel.cityTax,
          mealPrices: prices,
          plans: offeredMealPlans(hotel.restaurantEnabled, prices),
        }}
      />
    </>
  );
}
