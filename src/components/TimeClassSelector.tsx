"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const LABEL: Record<string, string> = {
  all: "Todas",
  bullet: "Bala",
  blitz: "Blitz",
  rapid: "Rápidas",
  daily: "Diarias",
  unknown: "Otras",
};

interface Props {
  classes: { time_class: string; count: number }[];
  current: string;
}

// Pills to switch the whole dashboard/stats between time controls (Blitz, Rapid,
// …) so ratings and stats never mix. Drives a `?tc=` query param.
export function TimeClassSelector({ classes, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (classes.length <= 1) return null; // nothing to switch between

  const go = (tc: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tc", tc);
    router.push(`${pathname}?${next.toString()}`);
  };

  // Stable, predictable order regardless of how counts fluctuate.
  const ORDER = ["blitz", "rapid", "bullet", "daily", "unknown"];
  const rank = (tc: string) => { const i = ORDER.indexOf(tc); return i === -1 ? ORDER.length : i; };
  const options = [
    ...classes.map((c) => c.time_class).sort((a, b) => rank(a) - rank(b)),
    "all",
  ];

  return (
    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
      {options.map((tc) => {
        const active = tc === current;
        const count = classes.find((c) => c.time_class === tc)?.count;
        return (
          <button
            key={tc}
            onClick={() => go(tc)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
            style={{
              borderColor: active ? "var(--bv-purple)" : "var(--border)",
              background: active ? "var(--bv-purple)" : "var(--card)",
              color: active ? "#fff" : "var(--muted-foreground)",
            }}
          >
            {LABEL[tc] ?? tc}
            {count != null && <span className={active ? "opacity-80" : "opacity-60"}> · {count}</span>}
          </button>
        );
      })}
    </div>
  );
}
