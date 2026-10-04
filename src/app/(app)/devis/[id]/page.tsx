import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeQuoteStatusAction, convertQuoteAction, deleteQuoteAction } from "../actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, PrintButton, SubmitButton } from "@/components/buttons";
import { BedIcon, CheckIcon, DownloadIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { QuoteDocument } from "@/components/quote-document";
import { CardHeader, Flash, PageHeader, QuoteBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { availableRooms } from "@/lib/availability";
import {
  QUOTE_TRANSITIONS,
  displayQuoteStatus,
  isQuoteEditable,
  isQuoteStatus,
  mealPlanLabel,
  type TransitionTone,
} from "@/lib/constants";
import { quoteLines } from "@/lib/folio";
import { formatDate, formatDateTime, guestName, plural, todayDate } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { getQuote } from "@/lib/queries";
import { nightsBetween, stayLength } from "@/lib/stay-math";

export const metadata: Metadata = { title: "Devis" };

const FLASH: Record<string, string> = {
  cree: "Devis créé. Téléchargez le PDF pour l'envoyer au client.",
  modifie: "Devis mis à jour.",
  statut: "Statut du devis mis à jour.",
};

const TONE: Record<TransitionTone, string> = {
  primary: "btn btn-outline",
  success: "btn btn-success",
  danger: "btn btn-danger",
  neutral: "btn btn-ghost",
};

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { ok } = await searchParams;
  const [hotel, quote] = await Promise.all([getHotel(), getQuote(id)]);
  if (!quote) notFound();

  const today = todayDate();
  const status = displayQuoteStatus(quote, today);
  const nights = nightsBetween(quote.checkIn, quote.checkOut);
  const roomCount = quote.rooms.reduce((s, r) => s + r.quantity, 0);
  const persons = quote.rooms.reduce((s, r) => s + r.quantity * (r.adults + r.children), 0);
  const editable = !quote.reservation && isQuoteEditable(quote.status);
  const transitions = !quote.reservation && isQuoteStatus(quote.status) ? QUOTE_TRANSITIONS[quote.status] : [];

  // Disponibilite actuelle de chaque categorie, pour la transformation en reservation.
  const canConvert = !quote.reservation && quote.status !== "REFUSE";
  const inPast = quote.checkIn < today;
  const free = canConvert && !inPast ? await availableRooms(quote.checkIn, quote.checkOut) : [];
  const needs = new Map<string, { name: string; wanted: number; free: number }>();
  for (const line of quote.rooms) {
    const entry = needs.get(line.roomTypeId) ?? {
      name: line.roomType.name,
      wanted: 0,
      free: free.filter((r) => r.roomTypeId === line.roomTypeId).length,
    };
    entry.wanted += line.quantity;
    needs.set(line.roomTypeId, entry);
  }
  const enough = [...needs.values()].every((n) => n.free >= n.wanted);

  return (
    <>
      <PageHeader
        back={{ href: "/devis", label: "Devis" }}
        eyebrow={`Devis ${quote.number}`}
        title={guestName(quote.guest)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <QuoteBadge status={status} />
            {formatDate(quote.checkIn)} → {formatDate(quote.checkOut)} · {stayLength(quote.checkIn, quote.checkOut)} · {plural(roomCount, "chambre")}
          </span>
        }
        actions={
          <>
            <a href={`/devis/${quote.id}/pdf?apercu`} target="_blank" rel="noreferrer" className="btn btn-outline">
              Aperçu PDF
            </a>
            <a href={`/devis/${quote.id}/pdf`} className="btn btn-outline">
              <DownloadIcon /> Télécharger
            </a>
            <PrintButton />
            {editable && (
              <Link href={`/devis/${quote.id}/modifier`} className="btn btn-primary">
                <PencilIcon /> Modifier
              </Link>
            )}
          </>
        }
      />

      {ok && FLASH[ok] && (
        <div className="no-print mb-6">
          <Flash>{FLASH[ok]}</Flash>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <QuoteDocument
          hotel={hotel}
          quote={quote}
          lines={quoteLines(quote)}
          nights={nights}
          mealLabel={mealPlanLabel(quote.mealPlan)}
          roomCount={roomCount}
          persons={persons}
        />

        <div className="no-print space-y-6">
          {quote.reservation ? (
            <section className="card p-5">
              <p className="eyebrow">Réservation</p>
              <p className="mt-2 text-sm">Ce devis a été transformé en réservation.</p>
              <Link href={`/reservations/${quote.reservation.id}`} className="btn btn-primary mt-4 w-full">
                <BedIcon /> Ouvrir {quote.reservation.number}
              </Link>
            </section>
          ) : (
            canConvert && (
              <section className="card">
                <CardHeader title="Transformer en réservation" description="Des chambres libres sont attribuées automatiquement." />
                <div className="space-y-2 px-5 py-4 text-sm">
                  {inPast ? (
                    <p className="text-amber-700 dark:text-amber-300">
                      La date d&apos;arrivée est passée : modifiez les dates du devis avant de le transformer.
                    </p>
                  ) : (
                    [...needs.values()].map((n) => (
                      <p key={n.name} className="flex items-center justify-between gap-3">
                        <span>{n.name}</span>
                        <span
                          className={`font-semibold ${
                            n.free >= n.wanted ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {n.wanted} demandée{n.wanted > 1 ? "s" : ""} · {n.free} libre{n.free > 1 ? "s" : ""}
                        </span>
                      </p>
                    ))
                  )}
                </div>
                <ActionForm action={convertQuoteAction} className="border-t px-5 py-4">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <SubmitButton className="btn btn-primary w-full" disabled={inPast || !enough} pendingLabel="Création…">
                    <CheckIcon /> Accepté : créer la réservation
                  </SubmitButton>
                  {!inPast && !enough && (
                    <p className="mt-2 text-xs text-muted">Pas assez de chambres libres : ajustez les dates ou les catégories.</p>
                  )}
                </ActionForm>
              </section>
            )
          )}

          {transitions.length > 0 && (
            <section className="card">
              <CardHeader title="Suivi du devis" />
              <div className="flex flex-col gap-2 px-5 py-4">
                {transitions.map((t) => (
                  <ActionForm key={t.to} action={changeQuoteStatusAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="to" value={t.to} />
                    <SubmitButton className={`${TONE[t.tone]} w-full`}>{t.label}</SubmitButton>
                  </ActionForm>
                ))}
              </div>
            </section>
          )}

          <section className="card p-5 text-sm">
            <p className="eyebrow">Informations</p>
            <p className="mt-2 text-muted">
              Créé par <span className="font-medium text-fg">{quote.createdBy.name}</span> le {formatDateTime(quote.createdAt)}.
            </p>
            {quote.updatedAt.getTime() !== quote.createdAt.getTime() && (
              <p className="text-muted">Dernière mise à jour le {formatDateTime(quote.updatedAt)}.</p>
            )}
            <Link href={`/clients/${quote.guest.id}`} className="accent mt-3 inline-block font-medium hover:underline">
              Fiche client →
            </Link>
          </section>

          {quote.status === "BROUILLON" && !quote.reservation && (
            <ActionForm action={deleteQuoteAction} className="card p-5">
              <input type="hidden" name="quoteId" value={quote.id} />
              <ConfirmSubmit message="Supprimer définitivement ce brouillon ?" className="btn btn-danger w-full">
                <TrashIcon /> Supprimer le brouillon
              </ConfirmSubmit>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
