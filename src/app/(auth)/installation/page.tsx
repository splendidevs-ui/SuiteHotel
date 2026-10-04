import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { InstallForm } from "@/components/auth-forms";
import { Logo } from "@/components/logo";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Installation" };

export default async function InstallPage() {
  // Rendu a chaque requete : pre-rendue au build, la page garderait l'etat de la base de build.
  await connection();
  if ((await db.user.count()) > 0) redirect("/connexion");
  return (
    <>
      <div className="mb-10 lg:hidden">
        <Logo />
      </div>
      <p className="eyebrow">Premier lancement</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">Installation</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Créez la fiche de l&apos;hôtel et le compte de la direction. Vous ajouterez ensuite les chambres et les
        comptes de la réception.
      </p>
      <InstallForm />
    </>
  );
}
