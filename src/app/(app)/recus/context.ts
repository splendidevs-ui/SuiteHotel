import "server-only";
import { formatDateRange, plural } from "@/lib/format";
import type { ReceiptDetail } from "@/lib/queries";
import { nightsBetween, stayLength } from "@/lib/stay-math";

/** Precisions imprimees sous l'objet d'un recu : sejour et chambres, ou addition. */
export function receiptContext(receipt: ReceiptDetail) {
  const r = receipt.reservation;
  if (r) {
    const rooms = r.rooms.map((x) => x.room.number);
    return [
      `Séjour du ${formatDateRange(r.checkIn, r.checkOut)} (${stayLength(r.checkIn, r.checkOut, r.checkInTime, r.checkOutTime).toLowerCase()})`,
      `${rooms.length > 1 ? "Chambres" : "Chambre"} ${rooms.join(", ")}`,
    ];
  }
  if (receipt.order) return [`Restaurant · addition ${receipt.order.number} · ${receipt.order.tableLabel}`];
  return [];
}
