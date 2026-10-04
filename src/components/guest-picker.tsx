"use client";

import { useMemo, useState } from "react";
import { ID_TYPES } from "@/lib/constants";
import type { GuestOption } from "@/lib/queries";
import type { GuestDraft, GuestRefValues } from "@/lib/schemas";
import { MailIcon, PhoneIcon, SearchIcon, StarIcon, UserPlusIcon } from "./icons";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Nom tape dans la recherche -> prenom / nom pour une nouvelle fiche. */
function draftFromQuery(query: string, draft: GuestDraft): GuestDraft {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return draft;
  if (words.length === 1) return { ...draft, lastName: words[0] };
  return { ...draft, firstName: words[0], lastName: words.slice(1).join(" ") };
}

const FIELDS: { key: keyof GuestDraft; label: string; type?: string; placeholder?: string; required?: boolean }[] = [
  { key: "firstName", label: "Prénom", required: true },
  { key: "lastName", label: "Nom", required: true },
  { key: "phone", label: "Téléphone", type: "tel", placeholder: "+225 07 00 00 00 00" },
  { key: "email", label: "E-mail", type: "email", placeholder: "client@exemple.com" },
  { key: "nationality", label: "Nationalité", placeholder: "Ivoirienne" },
  { key: "company", label: "Société", placeholder: "Pour une facturation entreprise" },
];

/** Choix du client : recherche dans les fiches existantes, ou saisie d'une nouvelle fiche. */
export function GuestPicker({
  guests,
  value,
  onChange,
}: {
  guests: GuestOption[];
  value: GuestRefValues;
  onChange: (value: GuestRefValues) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = value.mode === "existing" ? guests.find((g) => g.id === value.guestId) : undefined;

  const matches = useMemo(() => {
    const q = normalize(query);
    const list = q
      ? guests.filter((g) =>
          normalize([g.firstName, g.lastName, g.phone, g.email, g.company].filter(Boolean).join(" ")).includes(q),
        )
      : guests;
    return list.slice(0, 6);
  }, [guests, query]);

  const setDraft = (patch: Partial<GuestDraft>) => onChange({ ...value, draft: { ...value.draft, ...patch } });

  return (
    <div>
      <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Type de client">
        {(["existing", "new"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={value.mode === mode}
            onClick={() => onChange({ ...value, mode })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value.mode === mode ? "bg-gold-700 text-white" : "text-muted hover:text-fg"
            }`}
          >
            {mode === "existing" ? "Client existant" : "Nouveau client"}
          </button>
        ))}
      </div>

      {value.mode === "existing" &&
        (selected ? (
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gold-300 bg-gold-50 p-4 dark:border-gold-500/30 dark:bg-gold-500/10">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold">
                {selected.vip && <StarIcon className="accent size-3.5" />}
                {selected.firstName} {selected.lastName}
              </p>
              {selected.company && <p className="text-sm text-muted">{selected.company}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {selected.phone && (
                  <span className="inline-flex items-center gap-1">
                    <PhoneIcon className="size-3.5" /> {selected.phone}
                  </span>
                )}
                {selected.email && (
                  <span className="inline-flex items-center gap-1">
                    <MailIcon className="size-3.5" /> {selected.email}
                  </span>
                )}
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange({ ...value, guestId: "" })}>
              Changer
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                className="input pl-9"
                placeholder="Nom, téléphone, e-mail ou société"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher un client"
              />
            </div>
            <ul className="mt-2 divide-y rounded-lg border">
              {matches.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-alt"
                    onClick={() => {
                      onChange({ ...value, guestId: g.id });
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {g.vip && <StarIcon className="accent size-3" />}
                        {g.lastName.toUpperCase()} {g.firstName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {[g.company, g.phone, g.email].filter(Boolean).join(" · ") || "Aucune coordonnée"}
                      </span>
                    </span>
                    <span className="accent shrink-0 text-xs font-semibold">Choisir</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted">
                  Aucun client trouvé.{" "}
                  <button
                    type="button"
                    className="accent font-semibold underline"
                    onClick={() => onChange({ ...value, mode: "new", draft: draftFromQuery(query, value.draft) })}
                  >
                    Créer sa fiche
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}

      {value.mode === "new" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`guest-${f.key}`}>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              <input
                id={`guest-${f.key}`}
                type={f.type ?? "text"}
                className="input"
                required={f.required}
                placeholder={f.placeholder}
                value={value.draft[f.key]}
                onChange={(e) => setDraft({ [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="guest-idType">
              Pièce d&apos;identité
            </label>
            <select
              id="guest-idType"
              className="select"
              value={value.draft.idType}
              onChange={(e) => setDraft({ idType: e.target.value })}
            >
              <option value="">—</option>
              {ID_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="guest-idNumber">
              N° de la pièce
            </label>
            <input
              id="guest-idNumber"
              className="input"
              value={value.draft.idNumber}
              onChange={(e) => setDraft({ idNumber: e.target.value })}
            />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
            <UserPlusIcon className="size-4 shrink-0" />
            La fiche est créée à l&apos;enregistrement. Un client déjà connu (même e-mail, ou même téléphone et même
            nom) est retrouvé automatiquement.
          </p>
        </div>
      )}
    </div>
  );
}
