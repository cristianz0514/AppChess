"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { analyzeGameInBrowser } from "@/lib/clientAnalysis";

interface Props {
  gameId: string;
  reanalyze?: boolean;
}

export function GameAutoAnalyzer({ gameId, reanalyze }: Props) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"running" | "error">("running");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState(reanalyze ? "Generando el análisis del coach…" : "Analizando con Stockfish…");

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // useCallback rather than the ref-assigned-during-render this used to do:
  // writing to a ref while rendering is a real React violation (it's what
  // react-hooks/refs flags) and it predates this change — worth fixing while the
  // file is open rather than carrying it forward.
  const run = useCallback(async () => {
    try {
      // The analysis runs HERE, on this device. No request to the server, no
      // waiting for a shared engine: the progress numbers below come straight
      // out of the pipeline as it works.
      await analyzeGameInBrowser(gameId, {
        force: reanalyze === true,
        onProgress: (p) => {
          setDone(p.done);
          setTotal(p.total);
          if (p.label) setLabel(p.label);
        },
      });
      // On finish: a regeneration marks ?coach=1 so the page won't loop back
      // into regeneration if the comments couldn't be persisted; a fresh
      // analysis just refreshes.
      if (reanalyze) router.replace(`/blunders/${gameId}?coach=1`);
      else router.refresh();
    } catch {
      setStatus("error");
    }
  }, [gameId, reanalyze, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  return (
    <div className="deco-step border p-8 text-center flex flex-col items-center gap-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {status === "running" ? (
        <>
          <div className="w-12 h-12 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-purple)" }} />

          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>{label}</span>
              <span style={{ color: "var(--bv-purple)" }}>
                {total > 0 ? `${done}/${total}` : "Iniciando…"}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "var(--border)" }}>
              <div
                className="h-full w-full rounded-full transition duration-300"
                style={{
                  transform: `scaleX(${total > 0 ? pct / 100 : 0})`,
                  transformOrigin: "left",
                  background: "linear-gradient(90deg, var(--bv-electric), var(--bv-green))",
                }}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {total > 0
                ? `${pct}% completado — evaluando cada posición…`
                : "Cargando motor de análisis…"}
            </p>
          </div>
        </>
      ) : (
        <>
          <AlertTriangle size={32} style={{ color: "var(--bv-red)" }} />
          <div>
            <p className="text-sm font-semibold">No se pudo analizar la partida</p>
            <p className="text-xs text-muted-foreground mt-1">Inténtalo de nuevo en un momento.</p>
          </div>
          <button
            onClick={() => { setStatus("running"); setDone(0); setTotal(0); run(); }}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--bv-electric)", color: "#fff" }}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
