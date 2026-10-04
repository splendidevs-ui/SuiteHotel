import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelReceiptAction } from "../actions";
import { receiptContext } from "../context";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, PrintButton } from "@/components/buttons";
import { BanIcon, DownloadIcon } from "@/components/icons";
import { ReceiptDocument } from "@/components/receipt-document";
import { Flash, PageHeader } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { getReceipt } from "@/lib/queries";

export const metadata: Metadata = { title: "Reçu" };

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { ok } = await searchParams;
  const [hotel, receipt] = await Promise.all([getHotel(), getReceipt(id)]);
  if (!receipt) notFound();

  const back = receipt.reservation
    ? { href: `/reservations/${receipt.reservation.id}`, label: `Réservation ${receipt.reservation.number}` }
    : receipt.order
      ? { href: `/restaurant/commandes/${receipt.order.id}`, label: `Addition ${receipt.order.number}` }
      : { href: "/recus", label: "Reçus" };

  return (
    <>
      <PageHeader
        back={back}
        eyebrow="Reçu"
        title={receipt.number}
        description={`${receipt.payerName} · ${formatDateTime(receipt.paidAt)}`}
        actions={
          <>
            <a href={`/recus/${receipt.id}/pdf?apercu`} target="_blank" rel="noreferrer" className="btn btn-outline">
              Aperçu PDF
            </a>
            <a href={`/recus/${receipt.id}/pdf`} className="btn btn-outline">
              <DownloadIcon /> Télécharger
            </a>
            <PrintButton label="Imprimer le reçu" />
          </>
        }
      />

      <div className="no-print mb-6 space-y-3">
        {ok === "emis" && <Flash>Encaissement enregistré : le reçu {receipt.number} est prêt à être remis au client.</Flash>}
        {ok === "annule" && <Flash tone="info">Le reçu a été annulé.</Flash>}
        {receipt.cancelledAt && (
          <Flash tone="error">
            Reçu annulé le {formatDateTime(receipt.cancelledAt)}
            {receipt.cancelledBy ? ` par ${receipt.cancelledBy.name}` : ""}
            {receipt.cancelReason ? ` — ${receipt.cancelReason}` : ""}. Son montant n&apos;est plus compté dans les
            encaissements.
          </Flash>
        )}
      </div>

      <div className="mx-auto max-w-3xl">
        <ReceiptDocument hotel={hotel} receipt={receipt} context={receiptContext(receipt)} />

        {!receipt.cancelledAt && isDirection(user) && (
          <details className="no-print card mt-6 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-rose-700 dark:text-rose-300">
              Annuler ce reçu (direction)
            </summary>
            <ActionForm action={cancelReceiptAction} className="mt-3 space-y-3">
              <input type="hidden" name="receiptId" value={receipt.id} />
              <label className="label" htmlFor="reason">
                Motif
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={2}
                className="textarea"
                required
                minLength={3}
                placeholder="Erreur de saisie, remboursement du client…"
              />
              <p className="text-xs text-muted">
                Le reçu reste visible, barré, avec son motif. {receipt.order ? "L'addition redevient à encaisser." : ""}
              </p>
              <ConfirmSubmit message="Annuler ce reçu ? Cette action est définitive.">
                <BanIcon /> Confirmer l&apos;annulation
              </ConfirmSubmit>
            </ActionForm>
          </details>
        )}

        <p className="no-print mt-6 text-center text-sm">
          <Link href="/recus" className="accent font-medium hover:underline">
            Tous les reçus
          </Link>
        </p>
      </div>
    </>
  );
}
