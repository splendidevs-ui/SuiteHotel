import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { BusinessError, fail, type ActionResult } from "./errors";
import { firstIssueMessage, guestProfileSchema, type GuestRef } from "./schemas";

/**
 * Client d'une reservation ou d'un devis : fiche existante, ou fiche creee a la volee.
 * Un "nouveau" client deja connu (meme e-mail, ou meme telephone et meme nom) est
 * rattache a sa fiche existante plutot que dedouble.
 */
export async function resolveGuest(tx: Prisma.TransactionClient, ref: GuestRef): Promise<string> {
  if (ref.mode === "existing") {
    const guest = await tx.guest.findUnique({ where: { id: ref.guestId }, select: { id: true } });
    if (!guest) throw new BusinessError("Ce client n'existe plus. Rechargez la page.");
    return guest.id;
  }

  const email = ref.email.toLowerCase();
  const matches: Prisma.GuestWhereInput[] = [];
  if (email) matches.push({ email });
  if (ref.phone) matches.push({ phone: ref.phone, lastName: ref.lastName });
  if (matches.length) {
    const known = await tx.guest.findFirst({ where: { OR: matches }, select: { id: true } });
    if (known) return known.id;
  }

  const created = await tx.guest.create({
    data: {
      firstName: ref.firstName,
      lastName: ref.lastName,
      email: email || null,
      phone: ref.phone || null,
      nationality: ref.nationality || null,
      idType: ref.idType || null,
      idNumber: ref.idNumber || null,
      company: ref.company || null,
    },
    select: { id: true },
  });
  return created.id;
}

/** Creation ou mise a jour d'une fiche client depuis l'onglet Clients. */
export async function saveGuest(guestId: string | null, raw: unknown): Promise<ActionResult> {
  const parsed = guestProfileSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueMessage(parsed.error));
  const d = parsed.data;
  const data = {
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email.toLowerCase() || null,
    phone: d.phone || null,
    nationality: d.nationality || null,
    idType: d.idType || null,
    idNumber: d.idNumber || null,
    company: d.company || null,
    address: d.address || null,
    notes: d.notes || null,
    vip: d.vip,
  };

  if (guestId) {
    const exists = await db.guest.findUnique({ where: { id: guestId }, select: { id: true } });
    if (!exists) return fail("Ce client n'existe plus.");
    await db.guest.update({ where: { id: guestId }, data });
    return { ok: true, id: guestId };
  }
  const created = await db.guest.create({ data, select: { id: true } });
  return { ok: true, id: created.id };
}
