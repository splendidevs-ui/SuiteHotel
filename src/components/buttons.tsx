"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PrinterIcon } from "./icons";

/** Bouton d'envoi qui se desactive pendant l'execution de la server action. */
export function SubmitButton({
  children,
  pendingLabel = "Un instant…",
  className = "btn btn-primary",
  disabled = false,
  title,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} title={title}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Envoi precede d'une confirmation (annulation, suppression…). */
export function ConfirmSubmit({
  children,
  message,
  className = "btn btn-danger",
}: {
  children: ReactNode;
  message: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-outline" onClick={() => window.print()}>
      <PrinterIcon /> {label}
    </button>
  );
}

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
    >
      {message}
    </p>
  );
}

export function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      {message}
    </p>
  );
}
