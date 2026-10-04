import "server-only";
import type { Prisma } from "@prisma/client";
import { todayDateInput } from "./format";

const PREFIXES = { reservation: "RES", quote: "DEV", receipt: "REC", order: "CMD" } as const;
export type DocumentKind = keyof typeof PREFIXES;

/**
 * Numero suivant d'un document, continu par annee : RES-2026-0001, RES-2026-0002…
 * L'increment du compteur fait partie de la transaction appelante : un document
 * refuse (chambre deja prise, montant trop eleve…) ne consomme pas de numero.
 */
export async function nextNumber(tx: Prisma.TransactionClient, kind: DocumentKind) {
  const key = `${PREFIXES[kind]}-${todayDateInput().slice(0, 4)}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(4, "0")}`;
}
