"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Runs once, globally, the very first time anyone opens Practica el Mate:
// seeds the fixed Lichess batch (idempotent — later visits see 0 work to do
// and this component never renders again once puzzles exist).
export function PracticeSeeder() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/puzzles/seed", { method: "POST" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => router.refresh())
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <div className="rounded-2xl border p-8 text-center flex flex-col items-center gap-4"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {failed ? (
        <>
          <p className="text-sm font-semibold">No se pudo preparar los ejercicios.</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--bv-purple)" }}>
            Reintentar
          </button>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-purple)" }} />
          <div>
            <p className="text-sm font-semibold">Preparando tus ejercicios de mate…</p>
            <p className="text-xs text-muted-foreground mt-1">Solo pasa una vez — tarda unos segundos.</p>
          </div>
        </>
      )}
    </div>
  );
}

// Fires a bounded background scan of the player's own games for real forced
// mates. One visit only mines a handful of games (CPU budget), so this keeps
// firing on later visits — while under the target count — to converge toward
// a fuller personalized set over time. Non-blocking: the path is already
// usable with the Lichess puzzles while this runs.
const PERSONAL_TARGET = 10;

export function AutoMineMates({ personalCount }: { personalCount: number }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (personalCount >= PERSONAL_TARGET || started.current) return;
    started.current = true;
    fetch("/api/puzzles/mine", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.added > 0) router.refresh(); })
      .catch(() => {});
  }, [personalCount, router]);

  return null;
}
