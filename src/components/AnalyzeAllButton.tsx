"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Cpu } from "lucide-react";

interface Props {
  username: string;
}

interface BatchStatus {
  running: boolean;
  total: number;
  done: number;
}

// The heavy analysis runs on the SERVER (see analysisQueue). This component only
// kicks it off and polls for progress, so the user can leave the page and the
// work keeps going — and if they come back, it resumes showing progress.
export function AnalyzeAllButton({ username }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [error, setError] = useState(false);
  const lastDone = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/analyze/batch", { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as BatchStatus;
      setStatus(s);
      // Refresh dashboard data as games complete.
      if (s.done !== lastDone.current) { lastDone.current = s.done; router.refresh(); }
    } catch { /* keep polling */ }
  }, [router]);

  // On mount, check whether a batch is already running (resume display).
  useEffect(() => { poll(); }, [poll]);

  // Poll while running.
  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [status?.running, poll]);

  async function start() {
    setError(false);
    try {
      const res = await fetch("/api/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error();
      const s = (await res.json()) as BatchStatus;
      setStatus(s);
    } catch { setError(true); }
  }

  async function stop() {
    try {
      await fetch("/api/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
    } catch { /* ignore */ }
    poll();
  }

  const running = status?.running ?? false;
  const total = status?.total ?? 0;
  const done = status?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);

  return (
    <div className="rounded-2xl border p-4 space-y-3"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <Cpu size={14} style={{ color: "var(--bv-purple)" }} />
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          Análisis del Motor
        </p>
      </div>

      {running ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Analizando en segundo plano… {done}/{total}</p>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div className="h-full w-full rounded-full transition"
              style={{ transform: `scaleX(${pct / 100})`, transformOrigin: "left", background: "var(--bv-purple)" }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Puedes salir de esta pantalla: el análisis continúa solo ({remaining} restantes). El análisis profundo tarda ~1-2 min por partida.
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
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Evalúa tus partidas con Stockfish para obtener precisión, detección de errores y consejos personalizados. Corre en segundo plano — puedes seguir usando la app.
          </p>
          <button onClick={start}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition active:scale-[0.98]"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Analizar mis partidas
          </button>
        </>
      )}
    </div>
  );
}
