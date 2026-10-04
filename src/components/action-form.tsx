"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/form";
import { ErrorBox } from "./buttons";

/**
 * Formulaire relie a une server action qui redirige en cas de succes et renvoie
 * { error } sinon : le message s'affiche sous le formulaire, la saisie est conservee
 * (l'envoi passe par onSubmit, React ne reinitialise donc pas les champs).
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const formData = new FormData(e.currentTarget, submitter);
        startTransition(() => dispatch(formData));
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && (
        <div className="col-span-full mt-3 w-full">
          <ErrorBox message={state.error} />
        </div>
      )}
    </form>
  );
}
