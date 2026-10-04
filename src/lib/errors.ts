/** Resultat des operations metier, transmis tel quel aux server actions. */
export type ActionResult<T extends object = object> = ({ ok: true; id: string } & T) | { ok: false; error: string };

/** Refus metier leve dans une transaction : tout est annule, le message est montre tel quel. */
export class BusinessError extends Error {}

export function fail(error: string) {
  return { ok: false as const, error };
}

/** Execute `fn` et convertit un BusinessError en resultat d'echec (les autres erreurs remontent). */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BusinessError) return fail(error.message);
    throw error;
  }
}

export const RESTAURANT_OFF =
  "La restauration est désactivée : seule la formule « Chambre seule » peut être proposée.";

export const DIRECTION_ONLY = "Cette action est réservée à la direction.";
