import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingWizard } from "@/components/booking-wizard";
import { PageHeader } from "@/components/ui";
import { readSessionDraft, requireUser } from "@/lib/auth";
import { newBookingDraft, parseDraft, type BookingStep } from "@/lib/booking-draft";
import { mealPriceTable, offeredMealPlans } from "@/lib/constants";
import { addDaysToDateInput, formatDateTime, todayDateInput } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { getReservationFormData } from "@/lib/queries";

export const metadata: Metadata = { title: "Nouvelle réservation" };

const STEP_NUMBER: Record<BookingStep, number> = { chambres: 1, sejour: 2, client: 3 };

const HEADINGS: Record<BookingStep, { title: string; description: string }> = {
  chambres: {
    title: "Choisissez les chambres",
    description: "Une ou plusieurs chambres, par catégorie. Les dates se précisent à l'étape suivante.",
  },
  sejour: {
    title: "Précisez le séjour",
    description: "Dates, formule de restauration, occupants et tarif de chaque chambre.",
  },
  client: {
    title: "Pour quel client ?",
    description: "Client existant ou nouvelle fiche, acompte éventuel, puis confirmation.",
  },
};

/**
 * Parcours de reservation : chambres -> sejour -> client. La reservation en cours
 * est lue dans la session ; une etape n'est accessible qu'une fois les precedentes validees.
 */
export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  await requireUser();
  const { etape } = await searchParams;
  const [hotel, data, stored] = await Promise.all([getHotel(), getReservationFormData(), readSessionDraft().then(parseDraft)]);
  const today = todayDateInput();

  let draft = stored ?? newBookingDraft(today, hotel.checkInTime, hotel.checkOutTime);
  // Reservation commencee un jour precedent : le sejour repart d'aujourd'hui et doit etre revalide.
  if (!draft.checkIn || draft.checkIn < today) {
    draft = {
      ...draft,
      checkIn: today,
      checkOut: draft.checkOut >= today ? draft.checkOut : addDaysToDateInput(today, 1),
      done: { ...draft.done, sejour: false },
    };
  }

  const step: BookingStep = etape === "sejour" || etape === "client" ? etape : "chambres";
  if (step === "sejour" && !draft.done.chambres) redirect("/reservations/nouvelle");
  if (step === "client" && !draft.done.sejour) {
    redirect(draft.done.chambres ? "/reservations/nouvelle?etape=sejour" : "/reservations/nouvelle");
  }

  const prices = mealPriceTable(hotel);
  const inProgress = stored && (stored.rooms.length > 0 || stored.guest.guestId);

  return (
    <>
      <PageHeader
        back={{ href: "/reservations", label: "Réservations" }}
        eyebrow={`Nouvelle réservation · étape ${STEP_NUMBER[step]} sur 3`}
        title={HEADINGS[step].title}
        description={HEADINGS[step].description}
      />
      <BookingWizard
        key={step}
        step={step}
        initial={draft}
        data={data}
        today={today}
        startedAt={inProgress ? formatDateTime(stored.startedAt) : null}
        pricing={{
          currency: hotel.currency,
          vatRate: hotel.vatRate,
          cityTax: hotel.cityTax,
          mealPrices: prices,
          plans: offeredMealPlans(hotel.restaurantEnabled, prices, draft.mealPlan),
        }}
      />
    </>
  );
}
