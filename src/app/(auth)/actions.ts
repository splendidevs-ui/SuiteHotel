"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { echo, type FormState } from "@/lib/form";

export type AuthState = FormState;

/** N'autorise que les chemins internes ("/reservations/…"), jamais un autre domaine. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "E-mail et mot de passe requis.", values: echo(formData) };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Identifiants incorrects.", values: echo(formData) };
  }
  if (!user.active) return { error: "Ce compte a été désactivé. Adressez-vous à la direction.", values: echo(formData) };

  await createSession(user.id);
  redirect(safeNext(formData.get("suite")));
}

export async function logout() {
  await destroySession();
  redirect("/connexion");
}

const installSchema = z.object({
  hotelName: z.string().trim().min(2, "Le nom de l'hôtel est requis.").max(120),
  name: z.string().trim().min(2, "Votre nom complet est requis.").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200),
});

/** Premier lancement : cree la fiche de l'hotel et le compte de la direction. */
export async function install(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if ((await db.user.count()) > 0) redirect("/connexion");

  const parsed = installSchema.safeParse({
    hotelName: formData.get("hotelName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: echo(formData) };
  const { hotelName, name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    await tx.hotel.upsert({
      where: { id: "main" },
      update: { name: hotelName },
      create: { id: "main", name: hotelName },
    });
    return tx.user.create({ data: { name, email, passwordHash, role: "DIRECTION", jobTitle: "Direction générale" } });
  });

  await createSession(user.id);
  redirect("/chambres?bienvenue=1");
}
