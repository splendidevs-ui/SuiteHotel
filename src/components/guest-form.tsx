import { saveGuestAction } from "@/app/(app)/clients/actions";
import { ID_TYPES } from "@/lib/constants";
import { ActionForm } from "./action-form";
import { SubmitButton } from "./buttons";

type GuestValues = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  company: string | null;
  address: string | null;
  notes: string | null;
  vip: boolean;
};

const TEXT_FIELDS: { name: keyof GuestValues; label: string; type?: string; required?: boolean; placeholder?: string }[] = [
  { name: "firstName", label: "Prénom", required: true },
  { name: "lastName", label: "Nom", required: true },
  { name: "phone", label: "Téléphone", type: "tel", placeholder: "+225 07 00 00 00 00" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "nationality", label: "Nationalité" },
  { name: "company", label: "Société" },
];

/** Fiche client (creation ou modification). */
export function GuestForm({ guest }: { guest?: GuestValues }) {
  const value = (key: keyof GuestValues) => {
    const v = guest?.[key];
    return typeof v === "string" ? v : "";
  };
  return (
    <ActionForm action={saveGuestAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="guestId" value={guest?.id ?? ""} />
      {TEXT_FIELDS.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={`g-${f.name}`}>
            {f.label}
            {f.required ? " *" : ""}
          </label>
          <input
            id={`g-${f.name}`}
            name={f.name}
            type={f.type ?? "text"}
            required={f.required}
            placeholder={f.placeholder}
            defaultValue={value(f.name)}
            className="input"
          />
        </div>
      ))}
      <div>
        <label className="label" htmlFor="g-idType">
          Pièce d&apos;identité
        </label>
        <select id="g-idType" name="idType" defaultValue={value("idType")} className="select">
          <option value="">—</option>
          {ID_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="g-idNumber">
          N° de la pièce
        </label>
        <input id="g-idNumber" name="idNumber" defaultValue={value("idNumber")} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="g-address">
          Adresse
        </label>
        <textarea id="g-address" name="address" rows={2} defaultValue={value("address")} className="textarea" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="g-notes">
          Préférences et remarques
        </label>
        <textarea
          id="g-notes"
          name="notes"
          rows={3}
          defaultValue={value("notes")}
          className="textarea"
          placeholder="Oreillers à mémoire de forme, allergie aux fruits de mer, chambre en étage élevé…"
        />
      </div>
      <label className="flex items-center gap-3 sm:col-span-2">
        <input type="checkbox" name="vip" defaultChecked={guest?.vip ?? false} className="size-4 accent-gold-700" />
        <span className="text-sm font-medium">Client VIP</span>
        <span className="text-xs text-muted">— signalé à la réception, au planning et au restaurant</span>
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Enregistrement…">{guest ? "Enregistrer la fiche" : "Créer la fiche client"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
