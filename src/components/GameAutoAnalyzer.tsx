"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";

interface Props {
  gameId: string;
}

export function GameAutoAnalyzer({ gameId }: Props) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"running" | "busy" | "error">("running");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState("Analizando con Stockfish…");

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const run = useRef<(() => void) | undefined>(undefined);

  run.current = async () => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });

      // Engine busy — show message and retry in 15 seconds
      if (res.status === 503) {
        setStatus("busy");
        setTimeout(() => {
          setStatus("running");
          run.current?.();
        }, 15000);
        return;
      }

      if (!res.ok) throw new Error("analysis failed");

      // If browser supports streaming, read progress
      if (res.body) {
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
            const msg = JSON.parse(line);
            if (msg.error) throw new Error(msg.error);
            if (typeof msg.done === "number") setDone(msg.done);
            if (typeof msg.total === "number") setTotal(msg.total);
            if (typeof msg.label === "string" && msg.label) setLabel(msg.label);
            if (msg.finished) { router.refresh(); return; }
          }
        }
      }

      router.refresh();
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run.current?.();
  }, [gameId, router]);

  return (
    <div className="rounded-2xl border p-8 text-center flex flex-col items-center gap-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {status === "busy" ? (
        <>
          <Clock size={32} style={{ color: "var(--bv-purple)" }} />
          <div>
            <p className="text-sm font-semibold">Motor ocupado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Otra partida se está analizando. Reintentando automáticamente en 15 segundos…
            </p>
          </div>
        </>
      ) : status === "running" ? (
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
          <AlertTriangle size={32} style={{ color: "var(--bv-red)" }} />
          <div>
            <p className="text-sm font-semibold">No se pudo analizar la partida</p>
            <p className="text-xs text-muted-foreground mt-1">Inténtalo de nuevo en un momento.</p>
          </div>
          <button
            onClick={() => { started.current = false; setStatus("running"); setDone(0); setTotal(0); run.current?.(); }}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--bv-purple)", color: "#fff" }}>
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
