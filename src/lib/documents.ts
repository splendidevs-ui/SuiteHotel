import "server-only";
import { guestName } from "./format";
import type { PdfGuest } from "./pdf";

/** Utilitaires communs aux routes PDF (devis, note de sejour, recu). */

export function pdfGuest(g: {
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}): PdfGuest {
  return { name: guestName(g), company: g.company, email: g.email, phone: g.phone, address: g.address };
}

export function roomsLabel(rooms: { room: { number: string } }[]) {
  const numbers = rooms.map((r) => r.room.number);
  return numbers.length > 1 ? `Chambres ${numbers.join(", ")}` : `Chambre ${numbers[0] ?? "—"}`;
}

/** Telechargement du PDF ; `?apercu` l'ouvre dans le navigateur. */
export function pdfResponse(pdf: ArrayBuffer, filename: string, request: Request) {
  const disposition = new URL(request.url).searchParams.has("apercu") ? "inline" : "attachment";
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
