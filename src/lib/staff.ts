import "server-only";
import { z } from "zod";
import { hashPassword, type SessionUser } from "./auth";
import { ROLES } from "./constants";
import { db } from "./db";
import { DIRECTION_ONLY, fail, type ActionResult } from "./errors";

/**
 * Comptes du personnel, geres par la direction. Un compte n'est jamais supprime
 * (les reservations et recus restent attribues a leur auteur) : il est desactive,
 * ce qui ferme immediatement ses sessions. Il reste toujours une direction active.
 */

const role = z.enum(ROLES, { errorMap: () => ({ message: "Rôle invalide." }) });
const name = z.string().trim().min(2, "Indiquez le nom complet.").max(120);
const jobTitle = z.string().trim().max(80).default("");
const password = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200);

const createSchema = z.object({
  name,
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  role,
  jobTitle,
  password,
});

export async function createStaff(actor: SessionUser, raw: unknown): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return fail("Un compte existe déjà avec cette adresse e-mail.");
  const user = await db.user.create({
    data: { name: d.name, email: d.email, role: d.role, jobTitle: d.jobTitle || null, passwordHash: await hashPassword(d.password) },
  });
  return { ok: true, id: user.id };
}

async function otherActiveDirectors(userId: string) {
  return db.user.count({ where: { role: "DIRECTION", active: true, id: { not: userId } } });
}

export async function updateStaff(actor: SessionUser, userId: string, raw: unknown): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  const parsed = z.object({ name, role, jobTitle }).safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return fail("Ce compte n'existe plus.");
  if (target.role === "DIRECTION" && parsed.data.role !== "DIRECTION" && (await otherActiveDirectors(userId)) === 0) {
    return fail("Il faut au moins un compte de direction actif.");
  }
  await db.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, role: parsed.data.role, jobTitle: parsed.data.jobTitle || null },
  });
  return { ok: true, id: userId };
}

export async function setStaffActive(actor: SessionUser, userId: string, active: boolean): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  if (userId === actor.id && !active) return fail("Vous ne pouvez pas désactiver votre propre compte.");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return fail("Ce compte n'existe plus.");
  if (!active && target.role === "DIRECTION" && (await otherActiveDirectors(userId)) === 0) {
    return fail("Il faut au moins un compte de direction actif.");
  }
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { active } }),
    ...(active ? [] : [db.session.deleteMany({ where: { userId } })]),
  ]);
  return { ok: true, id: userId };
}

/** Nouveau mot de passe choisi par la direction ; les sessions du compte sont fermees. */
export async function resetStaffPassword(actor: SessionUser, userId: string, plain: string): Promise<ActionResult> {
  if (actor.role !== "DIRECTION") return fail(DIRECTION_ONLY);
  if (userId === actor.id) return fail("Pour votre propre compte, passez par Paramètres › Mot de passe.");
  const parsed = password.safeParse(plain);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return fail("Ce compte n'existe plus.");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(parsed.data) } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return { ok: true, id: userId };
}
