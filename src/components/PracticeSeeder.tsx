"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FAST_TARGET, FULL_TARGET } from "@/lib/puzzleConstants";

async function seedOne(mateIn: 1 | 2, count: number): Promise<{ added: number; total: number } | { error: string; code?: string }> {
  const res = await fetch("/api/puzzles/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mateIn, count }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "No se pudo preparar los ejercicios.", code: data.code };
  return data;
}

// Runs ONCE, the very first time anyone opens Practica el Mate: seeds just
// enough Mate en 1 puzzles to render a real path (fast — a few seconds), then
// hands off to BackgroundSeeder to fill the rest while the player is already
// playing. Idempotent — later visits see the target already met and skip straight through.
export function PracticeSeeder() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<{ message: string; schemaMissing: boolean } | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    seedOne(1, FAST_TARGET).then((r) => {
      if ("error" in r) { setError({ message: r.error, schemaMissing: r.code === "SCHEMA_MISSING" }); return; }
      router.refresh();
    });
  }, [router]);

  return (
    <div className="rounded-2xl border p-8 text-center flex flex-col items-center gap-4"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {error ? (
        <>
          <p className="text-sm font-semibold">
            {error.schemaMissing ? "Falta preparar la base de datos." : "No se pudo preparar los ejercicios."}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {error.schemaMissing
              ? "Este feature necesita las tablas 'puzzles' y 'puzzle_progress' en Supabase. Pide que se corra la migración 005."
              : "Puede ser una conexión lenta o un problema temporal."}
          </p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--bv-purple)" }}>
            Reintentar
          </button>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-purple)" }} />
          <div>
            <p className="text-sm font-semibold">Preparando tus primeros ejercicios…</p>
            <p className="text-xs text-muted-foreground mt-1">Solo pasa una vez — el resto se carga mientras juegas.</p>
          </div>
        </>
      )}
    </div>
  );
}

// Fires once the path is already showing: tops up Mate en 1 to its full
// target and seeds Mate en 2, sequentially, entirely in the background — the
// player is already solving puzzles while this runs. Refreshes quietly when
// new nodes are ready so they appear on the path without interrupting anything.
export function BackgroundSeeder({ mate1Count, mate2Count }: { mate1Count: number; mate2Count: number }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    const needsMore = mate1Count < FULL_TARGET[1] || mate2Count < FULL_TARGET[2];
    if (!needsMore || started.current) return;
    started.current = true;

    (async () => {
      let addedAny = false;
      if (mate1Count < FULL_TARGET[1]) {
        const r = await seedOne(1, FULL_TARGET[1]);
        if (!("error" in r) && r.added > 0) addedAny = true;
      }
      if (mate2Count < FULL_TARGET[2]) {
        const r = await seedOne(2, FULL_TARGET[2]);
        if (!("error" in r) && r.added > 0) addedAny = true;
      }
      if (addedAny) router.refresh();
    })();
  }, [mate1Count, mate2Count, router]);

  return null;
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
