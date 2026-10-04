import type { Metadata } from "next";
import Link from "next/link";
import { deleteRoomAction, saveRoomAction, saveRoomTypeAction, setServiceAction } from "./actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import { PlusIcon, StarIcon } from "@/components/icons";
import { Flash, PageHeader, RoomStateBadge, StatCard } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { ROOM_STATES, ROOM_STATE_META } from "@/lib/constants";
import { guestName, plural } from "@/lib/format";
import { getHotel } from "@/lib/hotel";
import { currencySymbol, formatMoney, isZeroDecimal, toInputAmount } from "@/lib/money";
import { getRoomsBoard } from "@/lib/queries";

export const metadata: Metadata = { title: "Chambres" };

const FLASH: Record<string, string> = {
  categorie: "Catégorie enregistrée.",
  chambre: "Chambre enregistrée.",
  service: "État de la chambre mis à jour.",
  supprimee: "Chambre supprimée.",
};

type Board = Awaited<ReturnType<typeof getRoomsBoard>>;
type RoomType = Board["types"][number];

function RoomTypeForm({ type, currency }: { type?: RoomType; currency: string }) {
  return (
    <ActionForm action={saveRoomTypeAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="typeId" value={type?.id ?? ""} />
      <div className="sm:col-span-2">
        <label className="label">Nom</label>
        <input name="name" required defaultValue={type?.name} className="input" placeholder="Suite Junior" />
      </div>
      <div>
        <label className="label">Tarif / nuit HT ({currencySymbol(currency)})</label>
        <input
          name="basePrice"
          type="number"
          min="0"
          step={isZeroDecimal(currency) ? "1" : "0.01"}
          required
          defaultValue={type ? toInputAmount(type.basePrice, currency) : ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Capacité (pers.)</label>
        <input name="capacity" type="number" min="1" max="12" required defaultValue={type?.capacity ?? 2} className="input" />
      </div>
      <div>
        <label className="label">Surface (m²)</label>
        <input name="size" type="number" min="1" defaultValue={type?.size ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Literie</label>
        <input name="bed" defaultValue={type?.bed ?? ""} className="input" placeholder="Lit King size" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea name="description" rows={2} defaultValue={type?.description ?? ""} className="textarea" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Prestations (une par ligne)</label>
        <textarea name="amenities" rows={3} defaultValue={type?.amenities ?? ""} className="textarea" placeholder={"Vue lagune\nBaignoire îlot\nMachine Nespresso"} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{type ? "Enregistrer la catégorie" : "Créer la catégorie"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ ok?: string; bienvenue?: string }> }) {
  const user = await requireUser();
  const { ok, bienvenue } = await searchParams;
  const [hotel, board] = await Promise.all([getHotel(), getRoomsBoard()]);
  const direction = isDirection(user);
  const cur = hotel.currency;

  const counts = Object.fromEntries(ROOM_STATES.map((s) => [s, board.rooms.filter((r) => r.state === s).length]));
  const floors = [...new Set(board.rooms.map((r) => r.floor))].sort((a, b) => a - b);

  return (
    <>
      <PageHeader
        title="Chambres"
        description="État de chaque chambre aujourd'hui, catégories et tarifs."
        actions={
          <Link href="/planning" className="btn btn-outline">
            Voir le planning
          </Link>
        }
      />

      <div className="mb-6 space-y-3">
        {bienvenue && (
          <Flash tone="info">
            Bienvenue ! Créez d&apos;abord vos catégories de chambres et leurs tarifs, puis les chambres. Vous pourrez ensuite
            ajouter les comptes de la réception dans « Équipe ».
          </Flash>
        )}
        {ok && FLASH[ok] && <Flash>{FLASH[ok]}</Flash>}
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Chambres" value={board.rooms.length} hint={plural(board.types.length, "catégorie")} />
        {ROOM_STATES.map((s) => (
          <StatCard key={s} label={ROOM_STATE_META[s].label} value={counts[s]} />
        ))}
      </div>

      {floors.map((floor) => (
        <section key={floor} className="mb-8">
          <h2 className="eyebrow mb-3">{floor === 0 ? "Rez-de-chaussée" : `${floor}${floor === 1 ? "er" : "e"} étage`}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {board.rooms
              .filter((r) => r.floor === floor)
              .map((room) => (
                <article key={room.id} className={`card flex flex-col p-4 ${room.outOfService ? "border-rose-300 dark:border-rose-900" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="tabular font-serif text-2xl font-semibold">{room.number}</p>
                      <p className="truncate text-xs text-muted">{room.roomType.name}</p>
                    </div>
                    <RoomStateBadge state={room.state} />
                  </div>
                  {room.reservation && (
                    <Link
                      href={`/reservations/${room.reservation.id}`}
                      className="mt-3 flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
                    >
                      {room.reservation.guest.vip && <StarIcon className="accent size-3.5" />}
                      {guestName(room.reservation.guest)}
                    </Link>
                  )}
                  {room.outOfService && room.notes && <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">{room.notes}</p>}

                  <div className="mt-auto space-y-2 pt-3">
                    {room.outOfService ? (
                      <ActionForm action={setServiceAction}>
                        <input type="hidden" name="roomId" value={room.id} />
                        <input type="hidden" name="outOfService" value="0" />
                        <SubmitButton className="btn btn-outline btn-sm w-full">Remettre en service</SubmitButton>
                      </ActionForm>
                    ) : (
                      room.state !== "OCCUPEE" &&
                      room.state !== "DEPART" && (
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Mettre hors service</summary>
                          <ActionForm action={setServiceAction} className="mt-2 space-y-2">
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="outOfService" value="1" />
                            <input name="notes" className="input text-sm" placeholder="Motif : travaux, panne…" aria-label="Motif" />
                            <SubmitButton className="btn btn-danger btn-sm w-full">Confirmer</SubmitButton>
                          </ActionForm>
                        </details>
                      )
                    )}
                    {direction && (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Modifier la chambre</summary>
                        <ActionForm action={saveRoomAction} className="mt-2 grid grid-cols-2 gap-2">
                          <input type="hidden" name="roomId" value={room.id} />
                          <input name="number" defaultValue={room.number} className="input text-sm" aria-label="Numéro" required />
                          <input name="floor" type="number" defaultValue={room.floor} className="input text-sm" aria-label="Étage" />
                          <select name="roomTypeId" defaultValue={room.roomTypeId} className="select col-span-2 text-sm" aria-label="Catégorie">
                            {board.types.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <SubmitButton className="btn btn-outline btn-sm col-span-2">Enregistrer</SubmitButton>
                        </ActionForm>
                        {room._count.stays === 0 && (
                          <ActionForm action={deleteRoomAction} className="mt-2">
                            <input type="hidden" name="roomId" value={room.id} />
                            <ConfirmSubmit message={`Supprimer la chambre ${room.number} ?`} className="btn btn-ghost btn-sm w-full text-rose-600">
                              Supprimer
                            </ConfirmSubmit>
                          </ActionForm>
                        )}
                      </details>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}

      {direction && (
        <details className="card mb-10 p-5" open={board.rooms.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <PlusIcon className="accent size-5" /> Ajouter une chambre
          </summary>
          {board.types.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Créez d&apos;abord une catégorie (ci-dessous).</p>
          ) : (
            <ActionForm action={saveRoomAction} className="mt-4 grid gap-3 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="new-number">
                  Numéro
                </label>
                <input id="new-number" name="number" required className="input" placeholder="305" />
              </div>
              <div>
                <label className="label" htmlFor="new-floor">
                  Étage
                </label>
                <input id="new-floor" name="floor" type="number" defaultValue="1" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="new-type">
                  Catégorie
                </label>
                <select id="new-type" name="roomTypeId" className="select">
                  {board.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
          )}
        </details>
      )}

      <section id="categories">
        <h2 className="font-serif text-2xl font-semibold">Catégories et tarifs</h2>
        <p className="mt-1 text-sm text-muted">Tarifs par nuit, hors taxes. Le tarif reste modifiable sur chaque réservation.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.types.map((t) => (
            <article key={t.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-lg font-semibold">{t.name}</h3>
                <p className="accent whitespace-nowrap font-semibold">
                  {formatMoney(t.basePrice, cur)}
                  <span className="text-xs font-normal text-muted"> / nuit</span>
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                {[`${t.capacity} pers.`, t.size ? `${t.size} m²` : null, t.bed, plural(t._count.rooms, "chambre")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {t.description && <p className="mt-3 text-sm">{t.description}</p>}
              {t.amenities && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {t.amenities
                    .split("\n")
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .map((a) => (
                      <li key={a} className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-muted">
                        {a}
                      </li>
                    ))}
                </ul>
              )}
              {direction && (
                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Modifier la catégorie</summary>
                  <div className="mt-3">
                    <RoomTypeForm type={t} currency={cur} />
                  </div>
                </details>
              )}
            </article>
          ))}
          {direction && (
            <details className="card p-5" open={board.types.length === 0}>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <PlusIcon className="accent size-5" /> Nouvelle catégorie
              </summary>
              <div className="mt-4">
                <RoomTypeForm currency={cur} />
              </div>
            </details>
          )}
        </div>
      </section>
    </>
  );
}
