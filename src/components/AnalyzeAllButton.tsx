"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Cpu } from "lucide-react";
import { analyzePendingInBrowser } from "@/lib/clientAnalysis";

interface Props {
  username: string;
}

// The analysis runs in THIS browser, on this device's CPU. It used to run on the
// server through a queue, which existed so concurrent users wouldn't collide on
// one shared engine — a problem that disappears when each browser has its own.
//
// One honest regression comes with that: the work no longer survives leaving the
// page. The old copy promised "puedes salir de esta pantalla", and keeping it
// would be a lie, so it now says the opposite. Progress itself is still safe —
// each game's moves are written as they're analysed, so nothing already finished
// is lost and restarting picks up from what's left.
export function AnalyzeAllButton({ username }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState("");
  const stopRequested = useRef(false);

  const start = useCallback(async () => {
    setError(false);
    stopRequested.current = false;
    setRunning(true);
    setDone(0);
    setTotal(0);
    setLabel("Buscando partidas sin analizar…");

    try {
      // This route only READS the database — no engine — so it stays on the
      // server, where it already has the session cookie.
      const res = await fetch(
        `/api/analyze/pending?username=${encodeURIComponent(username)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const { pending } = (await res.json()) as { pending: string[] };

      if (pending.length === 0) {
        setRunning(false);
        setLabel("");
        router.refresh();
        return;
      }

      setTotal(pending.length);
      await analyzePendingInBrowser(pending, {
        shouldStop: () => stopRequested.current,
        onProgress: (gameIndex, totalGames, p) => {
          setDone(gameIndex);
          setTotal(totalGames);
          setLabel(p.total > 0 ? `${p.label} (${p.done}/${p.total})` : p.label);
        },
      });

      setRunning(false);
      setLabel("");
      router.refresh();
    } catch {
      setRunning(false);
      setError(true);
    }
  }, [username, router]);

  const stop = () => {
    stopRequested.current = true;
    setLabel("Terminando la partida en curso…");
  };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);

  return (
    <div className="deco-step border p-4 space-y-3"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <Cpu size={14} style={{ color: "var(--bv-purple)" }} />
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          Análisis del Motor
        </p>
      </div>

      {running ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {total > 0 ? `Analizando partida ${done + 1} de ${total}` : "Preparando…"}
          </p>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div className="h-full w-full rounded-full transition"
              style={{ transform: `scaleX(${pct / 100})`, transformOrigin: "left", background: "var(--bv-electric)" }} />
          </div>
          {label && <p className="text-[10px] text-muted-foreground">{label}</p>}
          <p className="text-[10px] text-muted-foreground">
            El análisis usa el procesador de este dispositivo, así que mantén esta pestaña abierta
            {remaining > 0 ? ` (${remaining} por analizar)` : ""}. Lo ya analizado queda guardado.
          </p>
          <button onClick={stop}
            className="w-full py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-muted/40"
            style={{ borderColor: "var(--border)" }}>
            Detener
          </button>
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--bv-red)" }}>No se pudo iniciar el análisis.</p>
          <button onClick={start} className="text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{ background: "var(--bv-electric)", color: "#fff" }}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Evalúa tus partidas con Stockfish en este dispositivo: precisión, detección de
            errores y comentarios en cada jugada. La primera vez descarga el motor (7 MB).
          </p>
          <button onClick={start}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition active:scale-[0.98]"
            style={{ background: "var(--bv-electric)", color: "#fff" }}>
            Analizar mis partidas
          </button>
        </>
      )}
    </div>
  );
}
