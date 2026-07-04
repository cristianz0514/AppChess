"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Cpu } from "lucide-react";

interface Props {
  username: string;
}

// Orchestrates batch Stockfish analysis from the client: fetches the list of
// unanalyzed games, then analyzes them one at a time while showing progress.
// The deep analysis takes a while per game, so the user can cancel at any time
// and the work already done is kept.
export function AnalyzeAllButton({ username }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error" | "cancelled">("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const cancelled = useRef(false);

  async function run() {
    cancelled.current = false;
    setState("running");
    setDone(0);
    try {
      const res = await fetch(`/api/analyze/pending?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("pending fetch failed");
      const { pending } = (await res.json()) as { pending: string[] };

      setTotal(pending.length);
      if (pending.length === 0) {
        setState("done");
        router.refresh();
        return;
      }

      for (let i = 0; i < pending.length; i++) {
        if (cancelled.current) { setState("cancelled"); router.refresh(); return; }
        try {
          await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId: pending[i] }),
          });
        } catch {
          // skip a failing game and keep going
        }
        setDone(i + 1);
        // Refresh stats periodically so the user sees progress reflected
        if ((i + 1) % 3 === 0) router.refresh();
      }

      // Regenerate AI insights now that moves are populated
      try {
        await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
      } catch { /* non-fatal */ }

      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

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

      {state === "running" ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Analizando partidas… {done}/{total}</p>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: "var(--bv-purple)" }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            El análisis profundo tarda ~1-2 min por partida ({remaining} restantes). Puedes salir cuando quieras: lo analizado se guarda, y cada partida también se analiza sola al abrirla.
          </p>
          <button onClick={() => { cancelled.current = true; }}
            className="w-full py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-muted/40"
            style={{ borderColor: "var(--border)" }}>
            Detener
          </button>
        </div>
      ) : state === "done" ? (
        <p className="text-sm text-muted-foreground">
          ✅ Análisis completo. Tus estadísticas y consejos están actualizados.
        </p>
      ) : state === "cancelled" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Detuviste el análisis. Se guardaron {done} de {total} partidas.
          </p>
          <button onClick={run}
            className="w-full py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Continuar análisis
          </button>
        </div>
      ) : state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--bv-red)" }}>Ocurrió un error durante el análisis.</p>
          <button onClick={run} className="text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Evalúa tus partidas con Stockfish para obtener precisión, detección de errores y consejos personalizados.
          </p>
          <button onClick={run}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Analizar mis partidas
          </button>
        </>
      )}
    </div>
  );
}
