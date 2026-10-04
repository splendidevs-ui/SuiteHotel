import type { Metadata } from "next";
import { deleteMenuItemAction, saveMenuItemAction, toggleMenuItemAction } from "../actions";
import { RestaurantDisabled } from "../disabled";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import { PlusIcon } from "@/components/icons";
import { CardHeader, Flash, PageHeader } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { MENU_CATEGORIES, MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";
import { getHotel } from "@/lib/hotel";
import { currencySymbol, formatMoney, isZeroDecimal, toInputAmount } from "@/lib/money";
import { getMenu } from "@/lib/queries";

export const metadata: Metadata = { title: "La carte" };

type Item = Awaited<ReturnType<typeof getMenu>>[number];

function MenuItemForm({ item, currency, category }: { item?: Item; currency: string; category?: MenuCategory }) {
  return (
    <ActionForm action={saveMenuItemAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem]">
      <input type="hidden" name="itemId" value={item?.id ?? ""} />
      <div>
        <label className="label">Plat</label>
        <input name="name" required defaultValue={item?.name} className="input" placeholder="Capitaine braisé, attiéké" />
      </div>
      <div>
        <label className="label">Rubrique</label>
        <select name="category" defaultValue={item?.category ?? category ?? "PLAT"} className="select">
          {MENU_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MENU_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Prix HT ({currencySymbol(currency)})</label>
        <input
          name="price"
          type="number"
          min="0"
          step={isZeroDecimal(currency) ? "1" : "0.01"}
          required
          defaultValue={item ? toInputAmount(item.price, currency) : ""}
          className="input"
        />
      </div>
      <div className="sm:col-span-3">
        <label className="label">Description</label>
        <input name="description" defaultValue={item?.description ?? ""} className="input" placeholder="Facultatif" />
      </div>
      <div className="sm:col-span-3">
        <SubmitButton className="btn btn-primary btn-sm">{item ? "Enregistrer" : "Ajouter à la carte"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireUser();
  const hotel = await getHotel();
  if (!hotel.restaurantEnabled) return <RestaurantDisabled canEnable={isDirection(user)} />;
  const { ok } = await searchParams;
  const menu = await getMenu();
  const direction = isDirection(user);
  const cur = hotel.currency;

  return (
    <>
      <PageHeader
        back={{ href: "/restaurant", label: hotel.restaurantName ?? "Restaurant" }}
        eyebrow="Restauration"
        title="La carte"
        description={`Prix hors taxes ; la TVA (${hotel.vatRate} %) s'ajoute sur l'addition. Signalez un plat épuisé en un clic.`}
      />
      {ok && (
        <div className="mb-6">
          <Flash>{ok === "supprime" ? "Plat retiré de la carte." : "Carte enregistrée."}</Flash>
        </div>
      )}

      {direction && (
        <details className="card mb-6 p-5" open={menu.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <PlusIcon className="accent size-5" /> Ajouter un plat
          </summary>
          <div className="mt-4">
            <MenuItemForm currency={cur} />
          </div>
        </details>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {MENU_CATEGORIES.map((category) => {
          const items = menu.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category} className="card">
              <CardHeader title={MENU_CATEGORY_LABELS[category]} description={`${items.length} plat${items.length > 1 ? "s" : ""}`} />
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-medium ${item.available ? "" : "text-muted line-through"}`}>{item.name}</p>
                        {item.description && <p className="truncate text-xs text-muted">{item.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-right text-sm">
                          {formatMoney(item.price, cur)}
                          <span className="block text-[0.68rem] text-muted">
                            {formatMoney(Math.round(item.price * (1 + hotel.vatRate / 100)), cur)} TTC
                          </span>
                        </span>
                        <ActionForm action={toggleMenuItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <SubmitButton className={`btn btn-sm ${item.available ? "btn-outline" : "btn-success"}`}>
                            {item.available ? "Épuisé" : "Disponible"}
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </div>
                    {direction && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Modifier</summary>
                        <div className="mt-3 space-y-3">
                          <MenuItemForm item={item} currency={cur} />
                          <ActionForm action={deleteMenuItemAction}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <ConfirmSubmit message={`Retirer « ${item.name} » de la carte ?`} className="btn btn-ghost btn-sm text-rose-600">
                              Retirer de la carte
                            </ConfirmSubmit>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
