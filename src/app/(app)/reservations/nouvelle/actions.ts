"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSessionDraft, requireUser, writeSessionDraft } from "@/lib/auth";
import { applyRoomsStep, applyStayStep, confirmDraft } from "@/lib/booking";
import { mergeDraft, newBookingDraft, parseDraft, type BookingDraft } from "@/lib/booking-draft";
import { field, type FormState } from "@/lib/form";
import { todayDateInput } from "@/lib/format";

const BASE = "/reservations/nouvelle";
const STEPS = ["chambres", "sejour", "client"] as const;

async function sessionDraft() {
  return parseDraft(await readSessionDraft()) ?? newBookingDraft(todayDateInput());
}

/**
 * Ecrit la reservation en cours (null pour l'effacer). Le menu lateral l'affiche
 * (« Reprendre la réservation ») : la mise en page est donc rafraichie a chaque ecriture,
 * sinon une navigation interne garderait l'ancien etat.
 */
async function store(value: string | null) {
  await writeSessionDraft(value);
  revalidatePath("/", "layout");
}

async function keep(draft: BookingDraft) {
  await store(JSON.stringify(draft));
}

function parse(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 100_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Sauvegarde automatique pendant la saisie : la session garde toujours le dernier etat. */
export async function autosaveDraftAction(payload: string): Promise<void> {
  await requireUser();
  const patch = parse(payload);
  if (!patch) return;
  await keep(mergeDraft(await sessionDraft(), patch));
}

/** « Continuer », « Retour » ou « Confirmer la réservation ». */
export async function submitStepAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const draft = mergeDraft(await sessionDraft(), parse(formData.get("payload")));

  // Navigation entre les etapes : la saisie est gardee telle quelle.
  const goto = field(formData, "goto");
  if ((STEPS as readonly string[]).includes(goto)) {
    await keep(draft);
    redirect(goto === "chambres" ? BASE : `${BASE}?etape=${goto}`);
  }

  const step = field(formData, "step");
  if (step === "chambres" || step === "sejour") {
    const result = step === "chambres" ? await applyRoomsStep(draft) : await applyStayStep(draft);
    if (!result.ok) {
      await keep(draft);
      return { error: result.error };
    }
    await keep(result.draft);
    redirect(`${BASE}?etape=${step === "chambres" ? "sejour" : "client"}`);
  }

  // Etape client : confirmation. En cas de refus, la saisie reste en session.
  await keep(draft);
  const result = await confirmDraft(user, draft);
  if (!result.ok) return { error: result.error };
  await store(null);
  redirect(`/reservations/${result.id}?ok=creee${result.receiptId ? `&recu=${result.receiptId}` : ""}`);
}

/** « Abandonner » : efface la reservation en cours de la session. */
export async function resetDraftAction() {
  await requireUser();
  await store(null);
  redirect(BASE);
}
