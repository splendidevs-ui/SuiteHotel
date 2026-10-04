import Link from "next/link";
import type { ReactNode } from "react";
import {
  ORDER_STATUS_META,
  QUOTE_STATUS_META,
  RESERVATION_STATUS_META,
  ROLE_META,
  ROOM_STATE_META,
  isOrderStatus,
  isReservationStatus,
  type DisplayQuoteStatus,
  type Role,
  type RoomState,
} from "@/lib/constants";
import { initials } from "@/lib/format";
import { SearchIcon, StarIcon } from "./icons";

const AVATAR_TONES = [
  "bg-gold-100 text-gold-800 dark:bg-gold-500/20 dark:text-gold-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200",
];

function hash(value: string) {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Pastille aux initiales, couleur stable par personne. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const tone = AVATAR_TONES[hash(name) % AVATAR_TONES.length];
  const dims = size === "sm" ? "size-7 text-[0.62rem]" : "size-9 text-xs";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold ${dims} ${tone}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Badge({ label, className, dot }: { label: string; className: string; dot?: string }) {
  return (
    <span className={`badge ${className}`}>
      {dot && <span className={`size-1.5 rounded-full ${dot}`} />}
      {label}
    </span>
  );
}

export function ReservationBadge({ status }: { status: string }) {
  const meta = RESERVATION_STATUS_META[isReservationStatus(status) ? status : "CONFIRMEE"];
  return <Badge label={meta.label} className={meta.className} dot={meta.dot} />;
}

export function QuoteBadge({ status }: { status: DisplayQuoteStatus }) {
  return <Badge {...QUOTE_STATUS_META[status]} />;
}

export function OrderBadge({ status }: { status: string }) {
  return <Badge {...ORDER_STATUS_META[isOrderStatus(status) ? status : "OUVERTE"]} />;
}

export function RoomStateBadge({ state }: { state: RoomState }) {
  return <Badge {...ROOM_STATE_META[state]} />;
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge label={ROLE_META[role].label} className={ROLE_META[role].className} />;
}

export function VipBadge() {
  return (
    <span className="badge bg-gold-100 text-gold-800 dark:bg-gold-500/15 dark:text-gold-300" title="Client VIP">
      <StarIcon className="size-3" /> VIP
    </span>
  );
}

export function Flash({ tone = "success", children }: { tone?: "success" | "error" | "info"; children: ReactNode }) {
  const tones = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    error: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    info: "border-gold-200 bg-gold-50 text-gold-900 dark:border-gold-900/60 dark:bg-gold-950/40 dark:text-gold-200",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-gold-700 dark:hover:text-gold-300">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tuile d'indicateur : valeur en sans-serif, chiffres proportionnels. */
export function StatCard({
  label,
  value,
  hint,
  href,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition-colors hover:border-gold-400">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

/** Jauge d'un ratio (0 a 1) : piste et remplissage de la meme gamme. */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gold-100 dark:bg-gold-500/15"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-gold-600 dark:bg-gold-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Onglets de filtre (liens GET). */
export function FilterTabs({ tabs }: { tabs: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Filtres">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            t.active
              ? "border-gold-700 bg-gold-700 text-white"
              : "bg-surface text-muted hover:border-gold-400 hover:text-fg"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`rounded-full px-1.5 text-xs ${t.active ? "bg-white/20" : "bg-surface-alt"}`}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Recherche par lien GET, en conservant les autres filtres. */
export function SearchForm({
  action,
  q,
  placeholder,
  hidden = {},
}: {
  action: string;
  q: string;
  placeholder: string;
  hidden?: Record<string, string | undefined | null>;
}) {
  return (
    <form action={action} className="relative w-full sm:w-72" role="search">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input name="q" defaultValue={q} className="input pl-9" placeholder={placeholder} aria-label={placeholder} />
    </form>
  );
}

/** Pagination par liens GET, en conservant les filtres courants. */
export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined | null>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm" aria-label="Pagination">
      <span className="text-muted">
        Page {page} sur {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-outline btn-sm">
            Précédent
          </Link>
        ) : (
          <span className="btn btn-outline btn-sm opacity-40">Précédent</span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className="btn btn-outline btn-sm">
            Suivant
          </Link>
        ) : (
          <span className="btn btn-outline btn-sm opacity-40">Suivant</span>
        )}
      </div>
    </nav>
  );
}

/** Ligne "libelle : valeur" des fiches. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
