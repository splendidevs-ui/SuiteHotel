import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm, type DemoAccount } from "@/components/auth-forms";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_META, isRole } from "@/lib/constants";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Connexion" };

/** Comptes crees par `npm run db:seed`, proposes uniquement hors production. */
const DEMO_DOMAIN = "@suitehotel.ci";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  if ((await db.user.count()) === 0) redirect("/installation");
  if (await getCurrentUser()) redirect("/");
  const { suite } = await searchParams;

  let demoAccounts: DemoAccount[] = [];
  if (process.env.NODE_ENV !== "production") {
    const users = await db.user.findMany({
      where: { email: { endsWith: DEMO_DOMAIN }, active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { email: true, name: true, role: true, jobTitle: true },
    });
    demoAccounts = users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.jobTitle ?? (isRole(u.role) ? ROLE_META[u.role].label : u.role),
    }));
  }

  return (
    <>
      <div className="mb-10 lg:hidden">
        <Logo />
      </div>
      <p className="eyebrow">Personnel de l&apos;hôtel</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">Connexion</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Identifiez-vous pour accéder à l&apos;espace réception.</p>
      <LoginForm next={suite} demoAccounts={demoAccounts} />
    </>
  );
}
