"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  gameId: string;
}

// Auto-triggers Stockfish analysis for a game that has no analyzed moves yet,
// then refreshes the page so the GameViewer renders with real evaluations.
export function GameAutoAnalyzer({ gameId }: Props) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"running" | "error">("running");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId }),
        });
        if (!res.ok) throw new Error("analysis failed");
        router.refresh();
      } catch {
        setStatus("error");
      }
    })();
  }, [gameId, router]);

  return (
    <div className="rounded-2xl border p-8 text-center flex flex-col items-center gap-4"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {status === "running" ? (
        <>
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-purple)" }} />
          <div>
            <p className="text-sm font-semibold">Analizando con Stockfish…</p>
            <p className="text-xs text-muted-foreground mt-1">
              Evaluando cada jugada de la partida. Esto toma unos segundos.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="text-3xl">⚠️</p>
          <div>
            <p className="text-sm font-semibold">No se pudo analizar la partida</p>
            <p className="text-xs text-muted-foreground mt-1">
              Inténtalo de nuevo en un momento.
            </p>
          </div>
          <button
            onClick={() => { started.current = false; setStatus("running"); router.refresh(); }}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
