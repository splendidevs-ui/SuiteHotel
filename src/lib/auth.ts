import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { SESSION_COOKIE, isRole, type Role } from "./constants";

/** 12 heures : une journee de service. Les postes de la reception sont partages. */
const MAX_AGE = 60 * 60 * 12;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Seule l'empreinte du jeton est en base : une fuite de la base ne permet pas d'usurper une session. */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.$transaction([
    db.session.deleteMany({ where: { userId, expiresAt: { lt: now } } }),
    db.session.create({
      data: { tokenHash: hashToken(token), userId, expiresAt: new Date(now.getTime() + MAX_AGE * 1000) },
    }),
    db.user.update({ where: { id: userId }, data: { lastLoginAt: now } }),
  ]);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Ferme toutes les autres sessions de l'utilisateur (apres un changement de mot de passe). */
export async function revokeOtherSessions(userId: string) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({
    where: { userId, ...(token ? { NOT: { tokenHash: hashToken(token) } } : {}) },
  });
}

/** Reservation en cours de saisie, attachee a la session courante (JSON), ou null. */
export async function readSessionDraft(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { bookingDraft: true } });
  return session?.bookingDraft ?? null;
}

/** Enregistre (ou efface avec null) la reservation en cours dans la session courante. */
export async function writeSessionDraft(value: string | null) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { bookingDraft: value } });
}

/** Utilisateur connecte (memoise pour la requete en cours), ou null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: isRole(user.role) ? user.role : "RECEPTION",
    jobTitle: user.jobTitle,
  };
});

export function isDirection(user: Pick<SessionUser, "role">) {
  return user.role === "DIRECTION";
}

/** Pages et server actions : redirige vers la connexion si la session est absente ou expiree. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

/** Espace reserve a la direction : la reception est renvoyee au tableau de bord. */
export async function requireDirection() {
  const user = await requireUser();
  if (!isDirection(user)) redirect("/");
  return user;
}
