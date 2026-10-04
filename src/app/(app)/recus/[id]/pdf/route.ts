import { receiptContext } from "../../context";
import { getCurrentUser } from "@/lib/auth";
import { pdfResponse } from "@/lib/documents";
import { getHotel } from "@/lib/hotel";
import { generateReceiptPdf } from "@/lib/pdf";
import { getReceipt } from "@/lib/queries";

/** Recu en PDF, format A5 paysage (ajouter ?apercu pour l'ouvrir dans le navigateur). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Authentification requise.", { status: 401 });

  const { id } = await params;
  const [hotel, receipt] = await Promise.all([getHotel(), getReceipt(id)]);
  if (!receipt) return new Response("Reçu introuvable.", { status: 404 });

  const pdf = await generateReceiptPdf({
    hotel,
    receipt: { ...receipt, cancelled: Boolean(receipt.cancelledAt) },
    context: receiptContext(receipt),
    cashier: receipt.createdBy.name,
  });
  return pdfResponse(pdf, `${receipt.number}.pdf`, request);
}
