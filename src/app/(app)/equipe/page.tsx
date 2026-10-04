import type { Metadata } from "next";
import { createStaffAction, resetPasswordAction, toggleStaffAction, updateStaffAction } from "./actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/buttons";
import { UserPlusIcon } from "@/components/icons";
import { Avatar, Badge, CardHeader, Flash, PageHeader, RoleBadge } from "@/components/ui";
import { requireDirection } from "@/lib/auth";
import { ROLES, ROLE_META, isRole } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { listStaff } from "@/lib/queries";

export const metadata: Metadata = { title: "Équipe" };

const FLASH: Record<string, string> = {
  cree: "Compte créé. Communiquez l'adresse e-mail et le mot de passe à la personne concernée.",
  modifie: "Compte mis à jour.",
  statut: "Statut du compte mis à jour.",
  motdepasse: "Mot de passe réinitialisé : les sessions ouvertes de ce compte ont été fermées.",
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await requireDirection();
  const { ok } = await searchParams;
  const staff = await listStaff();

  return (
    <>
      <PageHeader
        title="Équipe"
        description="Comptes de la direction et de la réception. Un compte n'est jamais supprimé : il est désactivé, et ses sessions sont fermées."
      />
      {ok && FLASH[ok] && (
        <div className="mb-6">
          <Flash>{FLASH[ok]}</Flash>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card">
          <CardHeader title="Personnel" description={`${staff.filter((s) => s.active).length} compte(s) actif(s)`} />
          <ul className="divide-y">
            {staff.map((s) => {
              const role = isRole(s.role) ? s.role : "RECEPTION";
              const self = s.id === user.id;
              return (
                <li key={s.id} className={`px-5 py-4 ${s.active ? "" : "opacity-70"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={s.name} />
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {s.name}
                          {self && <span className="text-xs font-normal text-muted"> (vous)</span>}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {s.email}
                          {s.jobTitle ? ` · ${s.jobTitle}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleBadge role={role} />
                      {!s.active && <Badge label="Désactivé" className="bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" />}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Dernière connexion : {s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "jamais"}
                  </p>
                  <details className="mt-2">
                    <summary className="accent cursor-pointer text-xs font-medium">Gérer le compte</summary>
                    <div className="mt-3 grid gap-5 md:grid-cols-2">
                      <ActionForm action={updateStaffAction} className="space-y-2">
                        <input type="hidden" name="userId" value={s.id} />
                        <input name="name" defaultValue={s.name} required className="input text-sm" aria-label="Nom" />
                        <input name="jobTitle" defaultValue={s.jobTitle ?? ""} className="input text-sm" placeholder="Fonction" aria-label="Fonction" />
                        <select name="role" defaultValue={role} className="select text-sm" aria-label="Rôle">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_META[r].label}
                            </option>
                          ))}
                        </select>
                        <SubmitButton className="btn btn-outline btn-sm">Enregistrer</SubmitButton>
                      </ActionForm>
                      {!self && (
                        <div className="space-y-4">
                          <ActionForm action={resetPasswordAction} className="space-y-2">
                            <input type="hidden" name="userId" value={s.id} />
                            <input
                              name="password"
                              type="password"
                              minLength={8}
                              required
                              autoComplete="new-password"
                              className="input text-sm"
                              placeholder="Nouveau mot de passe (8 car. min.)"
                              aria-label="Nouveau mot de passe"
                            />
                            <SubmitButton className="btn btn-outline btn-sm">Réinitialiser le mot de passe</SubmitButton>
                          </ActionForm>
                          <ActionForm action={toggleStaffAction}>
                            <input type="hidden" name="userId" value={s.id} />
                            <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                            <ConfirmSubmit
                              message={s.active ? `Désactiver le compte de ${s.name} ?` : `Réactiver le compte de ${s.name} ?`}
                              className={`btn btn-sm ${s.active ? "btn-danger" : "btn-success"}`}
                            >
                              {s.active ? "Désactiver le compte" : "Réactiver le compte"}
                            </ConfirmSubmit>
                          </ActionForm>
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card self-start">
          <CardHeader title={<span className="inline-flex items-center gap-2"><UserPlusIcon className="accent size-5" /> Nouveau compte</span>} />
          <ActionForm action={createStaffAction} className="space-y-3 px-5 py-4">
            <div>
              <label className="label" htmlFor="name">
                Nom complet
              </label>
              <input id="name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">
                E-mail de connexion
              </label>
              <input id="email" name="email" type="email" required className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="role">
                  Rôle
                </label>
                <select id="role" name="role" defaultValue="RECEPTION" className="select">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="jobTitle">
                  Fonction
                </label>
                <input id="jobTitle" name="jobTitle" className="input" placeholder="Réceptionniste" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">
                Mot de passe provisoire
              </label>
              <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" />
            </div>
            <p className="text-xs text-muted">
              La réception gère réservations, devis, reçus, clients et restaurant. La direction gère en plus l&apos;équipe, les
              tarifs, la carte et peut annuler un reçu.
            </p>
            <SubmitButton className="btn btn-primary w-full">Créer le compte</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
