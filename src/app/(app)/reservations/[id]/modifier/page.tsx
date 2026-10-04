import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReservationForm } from "@/components/reservation-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isMealPlan, isReservationSource, mealPriceTable, offeredMealPlans } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { toInputAmount } from "@/lib/money";
import { getReservationForEdit, getReservationFormData } from "@/lib/queries";
import { EMPTY_GUEST, type ReservationFormValues } from "@/lib/schemas";

export const metadata: Metadata = { title: "Modifier la réservation" };

export default async function EditReservationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [hotel, reservation, data] = await Promise.all([getHotel(), getReservationForEdit(id), getReservationFormData(id)]);
  if (!reservation) notFound();
  if (reservation.status !== "CONFIRMEE") redirect(`/reservations/${id}`);

  const cur = reservation.currency;
  const mealPlan = isMealPlan(reservation.mealPlan) ? reservation.mealPlan : "CHAMBRE_SEULE";
  // La formule deja choisie garde le prix convenu a la reservation.
  const prices = { ...mealPriceTable(hotel), [mealPlan]: reservation.mealPlanPrice };

  const initial: ReservationFormValues = {
    guest: { mode: "existing", guestId: reservation.guestId, draft: EMPTY_GUEST },
    checkIn: toDateInput(reservation.checkIn),
    checkInTime: reservation.checkInTime,
    checkOut: toDateInput(reservation.checkOut),
    checkOutTime: reservation.checkOutTime,
    mealPlan,
    source: isReservationSource(reservation.source) ? reservation.source : "DIRECT",
    notes: reservation.notes ?? "",
    rooms: reservation.rooms.map((r) => ({
      roomId: r.roomId,
      adults: String(r.adults),
      children: String(r.children),
      nightlyRate: toInputAmount(r.nightlyRate, cur),
    })),
    deposit: { enabled: false, amount: "", method: "CARTE", reference: "" },
  };

  return (
    <>
      <PageHeader
        back={{ href: `/reservations/${id}`, label: reservation.number }}
        eyebrow={`Réservation ${reservation.number}`}
        title="Modifier la réservation"
        description="Chambres, séjour et client restent modifiables jusqu'à l'arrivée du client."
      />
      <ReservationForm
        initial={initial}
        data={data}
        reservationId={id}
        pricing={{
          currency: cur,
          vatRate: reservation.vatRate,
          cityTax: reservation.cityTax,
          mealPrices: prices,
          plans: offeredMealPlans(hotel.restaurantEnabled, prices, mealPlan),
        }}
      />
    </>
  );
}
