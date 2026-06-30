"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  gameId: string;
}

export function GameAutoAnalyzer({ gameId }: Props) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"running" | "error">("running");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

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

        if (!res.ok || !res.body) throw new Error("analysis failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.error) throw new Error(msg.error);
              if (typeof msg.done === "number") setDone(msg.done);
              if (typeof msg.total === "number") setTotal(msg.total);
              if (msg.finished) { router.refresh(); return; }
            } catch {
              throw new Error("stream parse error");
            }
          }
        }

        router.refresh();
      } catch {
        setStatus("error");
      }
    })();
  }, [gameId, router]);

  return (
    <div className="rounded-2xl border p-8 text-center flex flex-col items-center gap-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {status === "running" ? (
        <>
          <div className="w-12 h-12 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-purple)" }} />

          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>Analizando con Stockfish…</span>
              <span style={{ color: "var(--bv-purple)" }}>
                {total > 0 ? `${done}/${total} jugadas` : "Iniciando…"}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${total > 0 ? pct : 0}%`,
                  background: "linear-gradient(90deg, var(--bv-purple), var(--bv-green))",
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
          <p className="text-3xl">⚠️</p>
          <div>
            <p className="text-sm font-semibold">No se pudo analizar la partida</p>
            <p className="text-xs text-muted-foreground mt-1">Inténtalo de nuevo en un momento.</p>
          </div>
          <button
            onClick={() => { started.current = false; setStatus("running"); setDone(0); setTotal(0); router.refresh(); }}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
