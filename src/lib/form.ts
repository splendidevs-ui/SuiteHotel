/**
 * Etat renvoye par les server actions des formulaires.
 * `values` renvoie la saisie en cas d'erreur : React reinitialise les champs non
 * controles apres chaque action, ils reprennent ainsi ce que l'utilisateur avait tape.
 */
export type FormState = { error?: string; success?: string; values?: Record<string, string> } | undefined;

export function echo(formData: FormData, omit: string[] = ["password", "current", "next", "confirm"]) {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$") && !omit.includes(key)) out[key] = value;
  });
  return out;
}

/** Champ texte d'un FormData, espaces retires ("" si absent). */
export function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
