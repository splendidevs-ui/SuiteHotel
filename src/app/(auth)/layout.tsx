import { Logo } from "@/components/logo";
import { db } from "@/lib/db";

const FEATURES = [
  "Réservation d'une ou plusieurs chambres, avec la disponibilité en direct.",
  "Devis élégants, transformés en réservation en un clic.",
  "Reçus numérotés et note de séjour prêts à remettre au client.",
  "Restaurant en option : additions portées sur la chambre.",
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Lecture seule : la page de connexion ne cree jamais la fiche de l'hotel.
  const hotel = await db.hotel.findUnique({ where: { id: "main" }, select: { name: true, tagline: true } });

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgb(192_138_62/0.35),transparent_55%),radial-gradient(circle_at_0%_110%,rgb(192_138_62/0.18),transparent_50%)]"
          aria-hidden="true"
        />
        <div className="relative">
          <Logo tone="light" />
        </div>

        <div className="relative max-w-md">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-gold-400">Espace réception</p>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight">
            L&apos;excellence commence
            <br />
            <span className="text-gold-300">à la réception.</span>
          </h2>
          <div className="mt-8 h-px w-24 bg-gradient-to-r from-gold-400 to-transparent" aria-hidden="true" />
          <ul className="mt-8 space-y-3.5 text-sm text-ink-300">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-gold-400" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-ink-400">
          {hotel ? (
            <p>
              <span className="font-serif text-sm text-gold-200">{hotel.name}</span>
              {hotel.tagline && <span> · {hotel.tagline}</span>}
            </p>
          ) : (
            <p>SuiteHotel · Gestion hôtelière de prestige</p>
          )}
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
