import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import { isMenuCategory, isPaymentMethod } from "./constants";
import { db } from "./db";
import { BusinessError, attempt, fail, type ActionResult } from "./errors";
import { getHotel } from "./hotel";
import { toStoredAmount } from "./money";
import { nextNumber } from "./numbering";
import { insertReceipt } from "./receipts";
import { toNumber } from "./schemas";
import { lineAmount, orderTotals } from "./stay-math";

/**
 * Module restauration (option de l'hotel) : additions par table. Une addition en
 * cours est soit portee sur la note d'un client en sejour, soit encaissee (recu).
 */

const DISABLED = "Le module restauration est désactivé.";

async function openOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.restaurantOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new BusinessError("Cette addition n'existe plus.");
  if (order.status !== "OUVERTE") throw new BusinessError("Cette addition est close : elle ne peut plus être modifiée.");
  return order;
}

async function refreshTotals(tx: Prisma.TransactionClient, orderId: string, vatRate: number) {
  const lines = await tx.orderLine.findMany({ where: { orderId } });
  const totals = orderTotals(lines, vatRate);
  await tx.restaurantOrder.update({ where: { id: orderId }, data: totals });
  return totals;
}

async function requireInHouse(tx: Prisma.TransactionClient, reservationId: string) {
  const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
  if (!reservation || reservation.status !== "EN_SEJOUR") {
    throw new BusinessError("Seul un client en séjour peut être rattaché à une addition.");
  }
}

export interface OrderFields {
  tableLabel: string;
  covers: string;
  reservationId: string;
  guestName: string;
  notes: string;
}

export async function createOrder(actor: SessionUser, f: OrderFields): Promise<ActionResult> {
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled) return fail(DISABLED);
  const tableLabel = f.tableLabel.trim().slice(0, 60);
  if (!tableLabel) return fail("Indiquez la table (ou « Room service », « Bar »…).");
  const covers = Number(f.covers || 1);
  if (!Number.isInteger(covers) || covers < 1 || covers > 200) return fail("Nombre de couverts invalide.");

  return attempt(async () => {
    const order = await db.$transaction(async (tx) => {
      if (f.reservationId) await requireInHouse(tx, f.reservationId);
      return tx.restaurantOrder.create({
        data: {
          number: await nextNumber(tx, "order"),
          tableLabel,
          covers,
          reservationId: f.reservationId || null,
          guestName: f.guestName.trim().slice(0, 120) || null,
          notes: f.notes.trim().slice(0, 500) || null,
          vatRate: hotel.vatRate,
          createdById: actor.id,
        },
      });
    });
    return { ok: true as const, id: order.id };
  });
}

/** Ajoute un plat de la carte (ou incremente sa quantite). */
export async function addOrderItem(actor: SessionUser, orderId: string, menuItemId: string): Promise<ActionResult> {
  return attempt(async () => {
    await db.$transaction(async (tx) => {
      const order = await openOrder(tx, orderId);
      const item = await tx.menuItem.findUnique({ where: { id: menuItemId } });
      if (!item || !item.available) throw new BusinessError("Ce plat n'est plus disponible.");
      const line = await tx.orderLine.findFirst({ where: { orderId, menuItemId } });
      if (line) {
        const quantity = line.quantity + 1;
        await tx.orderLine.update({ where: { id: line.id }, data: { quantity, total: lineAmount(quantity, line.unitPrice) } });
      } else {
        await tx.orderLine.create({
          data: { orderId, menuItemId, name: item.name, quantity: 1, unitPrice: item.price, total: item.price },
        });
      }
      await refreshTotals(tx, orderId, order.vatRate);
    });
    return { ok: true as const, id: orderId };
  });
}

/** +1 / -1 sur une ligne ; a zero, la ligne disparait. Renvoie l'id de l'addition. */
export async function changeOrderLine(actor: SessionUser, lineId: string, delta: number): Promise<ActionResult> {
  return attempt(async () => {
    const orderId = await db.$transaction(async (tx) => {
      const line = await tx.orderLine.findUnique({ where: { id: lineId } });
      if (!line) throw new BusinessError("Cette ligne n'existe plus.");
      const order = await openOrder(tx, line.orderId);
      const quantity = line.quantity + Math.sign(delta);
      if (quantity <= 0) await tx.orderLine.delete({ where: { id: lineId } });
      else await tx.orderLine.update({ where: { id: lineId }, data: { quantity, total: lineAmount(quantity, line.unitPrice) } });
      await refreshTotals(tx, order.id, order.vatRate);
      return order.id;
    });
    return { ok: true as const, id: orderId };
  });
}

/** Porte l'addition sur la note de sejour du client (montant HT, la TVA est calculee sur la note). */
export async function chargeOrderToRoom(actor: SessionUser, orderId: string, reservationId: string): Promise<ActionResult> {
  return attempt(async () => {
    await db.$transaction(async (tx) => {
      const order = await openOrder(tx, orderId);
      if (order.total <= 0) throw new BusinessError("L'addition est vide.");
      const target = reservationId || order.reservationId;
      if (!target) throw new BusinessError("Choisissez la chambre du client.");
      await requireInHouse(tx, target);
      await tx.restaurantOrder.update({
        where: { id: orderId },
        data: { status: "IMPUTEE", reservationId: target, closedAt: new Date() },
      });
    });
    return { ok: true as const, id: orderId };
  });
}

/** Encaissement direct : emet le recu de l'addition. */
export async function payOrder(
  actor: SessionUser,
  orderId: string,
  f: { method: string; reference: string; payerName: string },
): Promise<ActionResult<{ receiptId: string }>> {
  if (!isPaymentMethod(f.method)) return fail("Choisissez le mode de règlement.");
  const hotel = await getHotel();
  return attempt(async () => {
    const receipt = await db.$transaction(async (tx) => {
      const order = await openOrder(tx, orderId);
      if (order.total <= 0) throw new BusinessError("L'addition est vide.");
      const created = await insertReceipt(tx, {
        orderId,
        payerName: f.payerName.trim().slice(0, 200) || order.guestName || `Client — ${order.tableLabel}`,
        label: `Addition ${order.number} — ${order.tableLabel}`,
        amount: order.total,
        currency: hotel.currency,
        method: f.method,
        reference: f.reference.trim().slice(0, 120) || null,
        createdById: actor.id,
      });
      await tx.restaurantOrder.update({ where: { id: orderId }, data: { status: "REGLEE", closedAt: new Date() } });
      return created;
    });
    return { ok: true as const, id: orderId, receiptId: receipt.id };
  });
}

export async function cancelOrder(actor: SessionUser, orderId: string): Promise<ActionResult> {
  const updated = await db.restaurantOrder.updateMany({
    where: { id: orderId, status: "OUVERTE" },
    data: { status: "ANNULEE", closedAt: new Date() },
  });
  if (updated.count === 0) return fail("Seule une addition en cours peut être annulée.");
  return { ok: true, id: orderId };
}

// ----- Carte -----

export interface MenuItemFields {
  name: string;
  category: string;
  description: string;
  price: string;
}

export async function saveMenuItem(actor: SessionUser, itemId: string | null, f: MenuItemFields): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail("Seule la direction peut modifier la carte.");
  const name = f.name.trim();
  if (name.length < 2 || name.length > 120) return fail("Indiquez le nom du plat (120 caractères au maximum).");
  if (!isMenuCategory(f.category)) return fail("Choisissez une rubrique de la carte.");
  const price = Number(toNumber(f.price));
  if (!Number.isFinite(price) || price < 0) return fail("Prix invalide.");

  const hotel = await getHotel();
  const data = {
    name,
    category: f.category,
    description: f.description.trim().slice(0, 300) || null,
    price: toStoredAmount(price, hotel.currency),
  };
  if (itemId) {
    const updated = await db.menuItem.updateMany({ where: { id: itemId }, data });
    if (updated.count === 0) return fail("Ce plat n'existe plus.");
    return { ok: true, id: itemId };
  }
  const sortOrder = await db.menuItem.count({ where: { category: f.category } });
  const created = await db.menuItem.create({ data: { ...data, sortOrder } });
  return { ok: true, id: created.id };
}

/** Disponible / en rupture : la salle peut le signaler, pas seulement la direction. */
export async function toggleMenuItem(actor: SessionUser, itemId: string): Promise<ActionResult> {
  const item = await db.menuItem.findUnique({ where: { id: itemId } });
  if (!item) return fail("Ce plat n'existe plus.");
  await db.menuItem.update({ where: { id: itemId }, data: { available: !item.available } });
  return { ok: true, id: itemId };
}

/** Les additions passees gardent le nom et le prix du plat supprime. */
export async function deleteMenuItem(actor: SessionUser, itemId: string): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail("Seule la direction peut modifier la carte.");
  const deleted = await db.menuItem.deleteMany({ where: { id: itemId } });
  if (deleted.count === 0) return fail("Ce plat n'existe plus.");
  return { ok: true, id: itemId };
}
