import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <Logo />
        <p className="eyebrow mt-10">Erreur 404</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Cette page n&apos;existe pas</h1>
        <p className="mt-2 text-sm text-muted">Le document a peut-être été supprimé, ou le lien est incomplet.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
