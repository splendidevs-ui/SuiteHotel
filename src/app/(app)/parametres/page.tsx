import type { Metadata } from "next";
import { changePasswordAction, saveHotelAction, saveProfileAction, saveRatesAction, saveRestaurantAction } from "./actions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/buttons";
import { CardHeader, Detail, Flash, PageHeader } from "@/components/ui";
import { isDirection, requireUser } from "@/lib/auth";
import { getHotel } from "@/lib/hotel";
import { SUPPORTED_CURRENCIES, currencySymbol, formatMoney, isZeroDecimal, toInputAmount } from "@/lib/money";

export const metadata: Metadata = { title: "Paramètres" };

const FLASH: Record<string, string> = {
  hotel: "Fiche de l'hôtel enregistrée.",
  tarifs: "Tarifs et taxes enregistrés.",
  restauration: "Réglages de la restauration enregistrés.",
  profil: "Profil mis à jour.",
  motdepasse: "Mot de passe modifié. Vos autres sessions ont été fermées.",
};

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  className = "",
  ...rest
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  className?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`s-${name}`}>
        {label}
      </label>
      <input id={`s-${name}`} name={name} type={type} defaultValue={defaultValue ?? ""} className="input" {...rest} />
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireUser();
  const { ok } = await searchParams;
  const hotel = await getHotel();
  const direction = isDirection(user);
  const cur = hotel.currency;
  const step = isZeroDecimal(cur) ? "1" : "0.01";
  const symbol = currencySymbol(cur);

  return (
    <>
      <PageHeader
        title="Paramètres"
        description={direction ? "Fiche de l'hôtel, tarifs et taxes, restauration, et votre compte." : "Votre compte et les informations de l'hôtel."}
      />
      {ok && FLASH[ok] && (
        <div className="mb-6">
          <Flash>{FLASH[ok]}</Flash>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {direction ? (
          <section className="card lg:col-span-2">
            <CardHeader title="Fiche de l'hôtel" description="En-tête et mentions des devis, notes de séjour et reçus." />
            <ActionForm action={saveHotelAction} className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field name="name" label="Nom de l'hôtel" defaultValue={hotel.name} required className="lg:col-span-2" />
              <Field name="stars" label="Étoiles" type="number" min="1" max="5" defaultValue={hotel.stars} />
              <Field name="tagline" label="Accroche" defaultValue={hotel.tagline} placeholder="Hôtel & Spa · Lagune Ébrié" className="sm:col-span-2 lg:col-span-3" />
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="label" htmlFor="s-address">
                  Adresse
                </label>
                <textarea id="s-address" name="address" rows={3} defaultValue={hotel.address ?? ""} className="textarea" />
              </div>
              <Field name="city" label="Ville" defaultValue={hotel.city} />
              <Field name="country" label="Pays" defaultValue={hotel.country} required />
              <Field name="phone" label="Téléphone" defaultValue={hotel.phone} />
              <Field name="email" label="E-mail" type="email" defaultValue={hotel.email} />
              <Field name="website" label="Site web" defaultValue={hotel.website} />
              <Field name="tradeRegister" label="RCCM" defaultValue={hotel.tradeRegister} />
              <Field name="taxId" label="N° de compte contribuable" defaultValue={hotel.taxId} />
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="label" htmlFor="s-bankDetails">
                  Coordonnées bancaires
                </label>
                <textarea id="s-bankDetails" name="bankDetails" rows={2} defaultValue={hotel.bankDetails ?? ""} className="textarea" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <SubmitButton>Enregistrer la fiche</SubmitButton>
              </div>
            </ActionForm>
          </section>
        ) : (
          <section className="card lg:col-span-2">
            <CardHeader title={hotel.name} description={hotel.tagline ?? undefined} />
            <dl className="grid gap-x-8 px-5 py-3 sm:grid-cols-2">
              <Detail label="Arrivée à partir de">{hotel.checkInTime}</Detail>
              <Detail label="Départ avant">{hotel.checkOutTime}</Detail>
              <Detail label="TVA">{hotel.vatRate} %</Detail>
              <Detail label="Taxe de séjour">{formatMoney(hotel.cityTax, cur)} / chambre / nuit</Detail>
            </dl>
          </section>
        )}

        {direction && (
          <section className="card">
            <CardHeader title="Tarifs et taxes" description="Appliqués aux nouvelles réservations et aux devis." />
            <ActionForm action={saveRatesAction} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-currency">
                  Devise
                </label>
                <select id="s-currency" name="currency" defaultValue={cur} className="select">
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>
              <Field name="vatRate" label="TVA (%)" type="number" min="0" max="100" step="0.01" defaultValue={hotel.vatRate} required />
              <Field
                name="cityTax"
                label={`Taxe de séjour (${symbol} / chambre / nuit)`}
                type="number"
                min="0"
                step={step}
                defaultValue={toInputAmount(hotel.cityTax, cur)}
                className="sm:col-span-2"
              />
              <Field name="checkInTime" label="Arrivée à partir de" type="time" defaultValue={hotel.checkInTime} required />
              <Field name="checkOutTime" label="Départ avant" type="time" defaultValue={hotel.checkOutTime} required />
              <Field
                name="quoteValidityDays"
                label="Validité des devis (jours)"
                type="number"
                min="1"
                max="365"
                defaultValue={hotel.quoteValidityDays}
                required
              />
              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-quoteTerms">
                  Conditions par défaut des devis
                </label>
                <textarea id="s-quoteTerms" name="quoteTerms" rows={4} defaultValue={hotel.quoteTerms ?? ""} className="textarea" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Enregistrer</SubmitButton>
              </div>
            </ActionForm>
          </section>
        )}

        {direction && (
          <section className="card" id="restauration">
            <CardHeader title="Restauration (option)" description="Carte, additions, room service et formules repas des séjours." />
            <ActionForm action={saveRestaurantAction} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <input type="checkbox" name="restaurantEnabled" defaultChecked={hotel.restaurantEnabled} className="size-4 accent-gold-700" />
                <span>
                  <span className="block text-sm font-semibold">Activer le module restauration</span>
                  <span className="block text-xs text-muted">
                    Désactivé, le menu Restaurant disparaît et seules les réservations « Chambre seule » sont proposées.
                  </span>
                </span>
              </label>
              <Field name="restaurantName" label="Nom du restaurant" defaultValue={hotel.restaurantName} className="sm:col-span-2" placeholder="Le Baobab" />
              <p className="text-xs text-muted sm:col-span-2">
                Prix des formules, par personne et par nuit, hors taxes ({symbol}). Une formule à 0 n&apos;est pas proposée.
              </p>
              <Field name="breakfastPrice" label="Petit-déjeuner" type="number" min="0" step={step} defaultValue={toInputAmount(hotel.breakfastPrice, cur)} />
              <Field name="halfBoardPrice" label="Demi-pension" type="number" min="0" step={step} defaultValue={toInputAmount(hotel.halfBoardPrice, cur)} />
              <Field name="fullBoardPrice" label="Pension complète" type="number" min="0" step={step} defaultValue={toInputAmount(hotel.fullBoardPrice, cur)} />
              <div className="sm:col-span-2">
                <SubmitButton>Enregistrer</SubmitButton>
              </div>
            </ActionForm>
          </section>
        )}

        <section className="card">
          <CardHeader title="Mon profil" description={user.email} />
          <ActionForm action={saveProfileAction} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <Field name="name" label="Nom complet" defaultValue={user.name} required />
            <Field name="jobTitle" label="Fonction" defaultValue={user.jobTitle} placeholder="Réceptionniste" />
            <div className="sm:col-span-2">
              <SubmitButton>Enregistrer</SubmitButton>
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <CardHeader title="Mot de passe" description="Vos autres sessions ouvertes seront fermées." />
          <ActionForm action={changePasswordAction} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <Field name="current" label="Mot de passe actuel" type="password" required className="sm:col-span-2" />
            <Field name="next" label="Nouveau mot de passe" type="password" required />
            <Field name="confirm" label="Confirmation" type="password" required />
            <div className="sm:col-span-2">
              <SubmitButton>Changer le mot de passe</SubmitButton>
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
