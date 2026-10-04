/** Monogramme (losange et "S") et nom de l'application. `light` : sur fond sombre. */
export function Logo({ tone = "default", showName = true }: { tone?: "default" | "light"; showName?: boolean }) {
  const light = tone === "light";
  return (
    <span className="inline-flex items-center gap-3">
      <span className="relative grid size-9 shrink-0 place-items-center" aria-hidden="true">
        <span className={`absolute inset-[5px] rotate-45 border ${light ? "border-gold-400" : "border-gold-600"}`} />
        <span className={`relative font-serif text-lg leading-none ${light ? "text-gold-300" : "text-gold-700"}`}>S</span>
      </span>
      {showName && (
        <span className="leading-none">
          <span className={`block font-serif text-[1.05rem] font-semibold tracking-[0.3em] ${light ? "text-white" : "text-fg"}`}>
            SUITE
          </span>
          <span className={`mt-1 block text-[0.58rem] font-semibold tracking-[0.5em] ${light ? "text-gold-400" : "text-gold-700"}`}>
            HOTEL
          </span>
        </span>
      )}
    </span>
  );
}
