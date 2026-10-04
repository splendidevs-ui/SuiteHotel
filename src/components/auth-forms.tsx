"use client";

import { useActionState, useState } from "react";
import { install, login, type AuthState } from "@/app/(auth)/actions";
import { ErrorBox } from "./buttons";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
}

export function LoginForm({ next, demoAccounts = [] }: { next?: string; demoAccounts?: DemoAccount[] }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action} className="space-y-4">
        <ErrorBox message={state?.error} />
        <input type="hidden" name="suite" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">
            Adresse e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="input"
            placeholder="prenom.nom@hotel.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Connexion…" : "Ouvrir ma session"}
        </button>
        <p className="text-center text-xs text-muted">
          Session de 12 heures. Pensez à vous déconnecter en fin de service.
        </p>
      </form>

      {demoAccounts.length > 0 && (
        <div className="mt-8 rounded-xl border border-dashed p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Comptes de démonstration · mot de passe <code className="font-mono normal-case">demo1234</code>
          </p>
          <div className="mt-3 space-y-1">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface"
                onClick={() => {
                  setEmail(account.email);
                  setPassword("demo1234");
                }}
              >
                <span className="min-w-0">
                  <span className="font-medium">{account.name}</span>
                  <span className="block truncate font-mono text-xs text-muted">{account.email}</span>
                </span>
                <span className="accent shrink-0 text-xs font-semibold">{account.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function InstallForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(install, undefined);
  const v = (key: string) => state?.values?.[key] ?? "";
  return (
    <form action={action} className="space-y-4">
      <ErrorBox message={state?.error} />
      <div>
        <label className="label" htmlFor="hotelName">
          Nom de l&apos;hôtel
        </label>
        <input id="hotelName" name="hotelName" required className="input" placeholder="Hôtel Les Palmiers" defaultValue={v("hotelName")} />
      </div>
      <div>
        <label className="label" htmlFor="name">
          Votre nom complet
        </label>
        <input id="name" name="name" required autoComplete="name" className="input" defaultValue={v("name")} />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Votre e-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={v("email")} />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
          placeholder="8 caractères minimum"
        />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Création…" : "Créer l'espace de l'hôtel"}
      </button>
    </form>
  );
}
