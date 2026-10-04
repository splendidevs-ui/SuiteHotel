import Link from "next/link";
import { PageHeader } from "@/components/ui";

/** Affiche quand le module restauration est desactive dans les parametres. */
export function RestaurantDisabled({ canEnable }: { canEnable: boolean }) {
  return (
    <>
      <PageHeader title="Restaurant" />
      <div className="card px-6 py-12 text-center">
        <p className="font-serif text-xl font-semibold">Le module restauration est désactivé</p>
        <p className="mt-2 text-sm text-muted">
          Activez-le pour gérer la carte, les additions des tables et le room service, et proposer des formules repas dans
          les réservations.
        </p>
        {canEnable ? (
          <Link href="/parametres#restauration" className="btn btn-primary mt-6">
            Activer la restauration
          </Link>
        ) : (
          <p className="mt-6 text-sm text-muted">Adressez-vous à la direction pour l&apos;activer.</p>
        )}
      </div>
    </>
  );
}
