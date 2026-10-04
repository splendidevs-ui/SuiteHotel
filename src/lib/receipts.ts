import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import { db } from "./db";
import { BusinessError, DIRECTION_ONLY, attempt, fail, type ActionResult } from "./errors";
import { getFolio } from "./folio";
import { guestName } from "./format";
import { formatMoney, toStoredAmount } from "./money";
import { nextNumber } from "./numbering";
import { firstIssueMessage, paymentSchema } from "./schemas";

/**
 * Recus : chaque encaissement (acompte, solde, addition du restaurant) en emet un,
 * numerote REC-2026-0001… Un recu n'est jamais supprime ; la direction peut
 * l'annuler avec un motif, il reste alors visible, barre, dans la liste.
 */

type ReceiptData = {
  reservationId?: string | null;
  orderId?: string | null;
  payerName: string;
  label: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string | null;
  balanceAfter?: number | null;
  createdById: string;
};

export async function insertReceipt(tx: Prisma.TransactionClient, data: ReceiptData) {
  const number = await nextNumber(tx, "receipt");
  return tx.receipt.create({ data: { ...data, number } });
}

/** Libelle d'un reglement de sejour, selon le moment et le montant. */
export function paymentLabel(status: string, reservationNumber: string, amount: number, balance: number) {
  const full = amount === balance;
  if (status === "CONFIRMEE") {
    return full ? `Prépaiement du séjour — réservation ${reservationNumber}` : `Acompte — réservation ${reservationNumber}`;
  }
  return full ? `Solde du séjour — ${reservationNumber}` : `Règlement partiel — séjour ${reservationNumber}`;
}

/** Encaissement sur une reservation : emet le recu, avec le reste a payer apres paiement. */
export async function recordPayment(actor: SessionUser, reservationId: string, raw: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueMessage(parsed.error));
  const input = parsed.data;

  return attempt(async () => {
    const receipt = await db.$transaction(async (tx) => {
      const folio = await getFolio(reservationId, tx);
      if (!folio) throw new BusinessError("Cette réservation n'existe plus.");
      const { reservation, balance } = folio;
      if (reservation.status === "ANNULEE") {
        throw new BusinessError("Cette réservation est annulée : aucun encaissement n'est possible.");
      }
      if (balance <= 0) throw new BusinessError("Le séjour est entièrement réglé.");
      const amount = toStoredAmount(input.amount, reservation.currency);
      if (amount > balance) {
        throw new BusinessError(`Le montant dépasse le reste à payer (${formatMoney(balance, reservation.currency)}).`);
      }
      return insertReceipt(tx, {
        reservationId,
        payerName: input.payerName || guestName(reservation.guest),
        label: paymentLabel(reservation.status, reservation.number, amount, balance),
        amount,
        currency: reservation.currency,
        method: input.method,
        reference: input.reference || null,
        balanceAfter: balance - amount,
        createdById: actor.id,
      });
    });
    return { ok: true as const, id: receipt.id };
  });
}

/** Annulation d'un recu (direction). Une addition reglee par ce recu redevient a encaisser. */
export async function cancelReceipt(actor: SessionUser, receiptId: string, reason: string): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const motive = reason.trim();
  if (motive.length < 3) return fail("Indiquez le motif de l'annulation.");

  return attempt(async () => {
    await db.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({ where: { id: receiptId }, include: { order: true } });
      if (!receipt) throw new BusinessError("Ce reçu n'existe plus.");
      if (receipt.cancelledAt) throw new BusinessError("Ce reçu est déjà annulé.");
      await tx.receipt.update({
        where: { id: receiptId },
        data: { cancelledAt: new Date(), cancelledById: actor.id, cancelReason: motive.slice(0, 500) },
      });
      if (receipt.order?.status === "REGLEE") {
        await tx.restaurantOrder.update({ where: { id: receipt.order.id }, data: { status: "OUVERTE", closedAt: null } });
      }
    });
    return { ok: true as const, id: receiptId };
  });
}
