"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Big_Shoulders } from "next/font/google";
import { trackGamesImported } from "@/lib/installTracking";
import { Target, Activity, Crosshair, BookOpen, type LucideIcon } from "lucide-react";

// Display face for this page only — a condensed geometric skyscraper-signage
// face (literally the typeface family used on Chicago high-rises), the
// clearest way to get "modern art deco" into type without reaching for a
// literal 1920s pastiche. Scoped to this route; the rest of the app keeps
// Fraunces/Inter.
const decoDisplay = Big_Shoulders({
  variable: "--font-deco-display",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

function Sunburst() {
  const rayCount = 20;
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className="absolute pointer-events-none"
      style={{ width: 280, height: 280, top: -54, left: "50%", transform: "translateX(-50%)" }}
    >
      {Array.from({ length: rayCount }).map((_, i) => {
        const angle = (i / rayCount) * Math.PI * 2;
        const inner = 44;
        const outer = i % 2 === 0 ? 98 : 78;
        // Rounded to 2dp — SSR/CSR can otherwise disagree on the last digit
        // of the raw float (Node vs browser rounding), which trips a
        // hydration mismatch even though the geometry is identical.
        const x1 = +(100 + Math.cos(angle) * inner).toFixed(2);
        const y1 = +(100 + Math.sin(angle) * inner).toFixed(2);
        const x2 = +(100 + Math.cos(angle) * outer).toFixed(2);
        const y2 = +(100 + Math.sin(angle) * outer).toFixed(2);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="var(--deco-brass)" strokeWidth={1.25} opacity={0.55} strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError("");
    setPhase("Conectando con Chess.com…");
    setProgress(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo importar. Inténtalo de nuevo.");
      }

      // Stream real progress (NDJSON) — a full-history import can take a while,
      // so the user always sees what's happening instead of a frozen screen.
      let imported = 1;
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
            if (typeof msg.phase === "string") setPhase(msg.phase);
            if (typeof msg.done === "number" && typeof msg.total === "number") setProgress({ done: msg.done, total: msg.total });
            if (msg.finished) { imported = msg.imported ?? 1; }
          }
        }
      }

      trackGamesImported(imported);
      document.cookie = `bv_username=${encodeURIComponent(username.trim())}; path=/; max-age=2592000; SameSite=Lax`;
      setPhase("¡Listo! Abriendo tu panel…");
      router.push(`/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setLoading(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  const features: { Icon: LucideIcon; title: string; desc: string }[] = [
    { Icon: Target,    title: "Detecta tus errores", desc: "Stockfish analiza cada jugada y clasifica errores graves, errores e imprecisiones." },
    { Icon: Activity,  title: "Barra de evaluación", desc: "Ve cómo cambia la ventaja en cada movimiento de la partida." },
    { Icon: Crosshair, title: "Practica tus errores", desc: "Reproduce las posiciones donde fallaste e intenta encontrar la jugada correcta." },
    { Icon: BookOpen,  title: "Repertorio de aperturas", desc: "Descubre con qué aperturas ganas más y cuáles debes mejorar." },
  ];

  return (
    <main className={`${decoDisplay.variable} deco-page min-h-screen flex flex-col relative overflow-hidden`}>

      {/* Hero */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 pt-20 pb-8 text-center"
        style={{ animation: "bvFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        <div className="relative mb-6 flex items-center justify-center" style={{ width: 72, height: 72 }}>
          <Sunburst />
          <div className="deco-medallion relative w-16 h-16 flex items-center justify-center select-none"
            style={{ background: "var(--deco-ink-2)" }}>
            <span className="text-2xl leading-none" style={{ color: "var(--deco-brass)" }}>♞</span>
          </div>
        </div>

        <p className="deco-mono text-[11px] font-bold tracking-[0.28em] uppercase mb-4" style={{ color: "var(--deco-brass)" }}>
          Tu entrenador de ajedrez con IA
        </p>

        <h1 className="deco-display text-5xl leading-[0.92] mb-4 text-balance max-w-sm uppercase">
          Descubre dónde se te <span style={{ color: "var(--deco-emerald)" }}>escapan</span> las partidas
        </h1>

        <p className="text-base max-w-sm leading-relaxed mb-8" style={{ color: "var(--deco-muted)" }}>
          Conecta tu cuenta de Chess.com y Stockfish analiza cada jugada — errores graves, momentos clave y qué debiste jugar.
        </p>

        {/* Form */}
        <form onSubmit={handleImport} className="deco-panel w-full max-w-xs p-5 space-y-3">
          <input
            type="text"
            placeholder="Tu usuario de Chess.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            disabled={loading}
            className="deco-input w-full px-4 py-3 text-sm outline-none transition"
          />
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="deco-cta w-full py-3 text-sm font-bold uppercase tracking-[0.08em] transition active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2 normal-case tracking-normal">
                <span className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black/70 animate-spin inline-block" />
                {phase || "Importando tu historial…"}
              </span>
            ) : "Ver mis partidas →"}
          </button>

          {/* Real progress feedback — a full-history import can take a while;
              this is what keeps it from ever looking frozen/failed. */}
          {loading && (
            <div className="space-y-1.5">
              <div className="w-full h-1 overflow-hidden" style={{ background: "var(--deco-ink-2)" }}>
                <div
                  className="h-full transition duration-300"
                  style={{
                    width: pct != null ? "100%" : "30%",
                    transform: pct != null ? `scaleX(${pct / 100})` : undefined,
                    transformOrigin: "left",
                    background: "linear-gradient(90deg, var(--deco-brass), var(--deco-emerald))",
                    animation: pct == null ? "bvIndeterminate 1.3s ease-in-out infinite" : undefined,
                  }}
                />
              </div>
              {progress && (
                <p className="deco-mono text-[11px] text-center tabular-nums" style={{ color: "var(--deco-muted)" }}>
                  {progress.done}/{progress.total}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-center" style={{ color: "#E5747A" }}>{error}</p>
          )}
        </form>

        <p className="deco-mono text-[10px] tracking-[0.12em] uppercase mt-5" style={{ color: "var(--deco-muted)" }}>
          Gratis · Sin registro · Todo tu historial público
        </p>
      </div>

      {/* Features — a deco building directory: brass hairlines between rows,
          not a numbered sequence (these four are parallel, not steps). */}
      <div className="relative px-5 pb-12 max-w-sm mx-auto w-full">
        <div className="deco-hairline" />
        {features.map((f, i) => (
          <div key={f.title}>
            <div className="flex items-start gap-4 py-4"
              style={{ animation: `bvFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both ${0.15 + i * 0.07}s` }}>
              <div className="deco-icon-frame shrink-0 w-10 h-10 flex items-center justify-center">
                <f.Icon size={16} style={{ color: "var(--deco-brass)" }} strokeWidth={2} />
              </div>
              <div className="text-left">
                <p className="deco-mono text-[11px] font-bold tracking-[0.06em] uppercase mb-1" style={{ color: "var(--deco-porcelain)" }}>{f.title}</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--deco-muted)" }}>{f.desc}</p>
              </div>
            </div>
            <div className="deco-hairline" />
          </div>
        ))}
      </div>

      <style>{`
        .deco-page {
          --deco-ink: #0B0D12;
          --deco-ink-2: #14171F;
          --deco-porcelain: #F3EFE6;
          --deco-brass: #C9A15C;
          --deco-emerald: #22B27E;
          --deco-muted: #8B8F9B;
          background: var(--deco-ink);
          color: var(--deco-porcelain);
        }
        .deco-display {
          font-family: var(--font-deco-display), sans-serif;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .deco-mono { font-family: var(--font-geist-mono), monospace; }

        /* Signature shape: a stepped/ziggurat octagon — deco's massing motif,
           reused for the monogram and (mirrored, gentler) the icon frames. */
        .deco-medallion {
          clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%);
          border: 1px solid var(--deco-brass);
        }
        .deco-icon-frame {
          clip-path: polygon(22% 0, 78% 0, 100% 22%, 100% 78%, 78% 100%, 22% 100%, 0 78%, 0 22%);
          background: var(--deco-ink-2);
          border: 1px solid color-mix(in oklab, var(--deco-brass) 45%, transparent);
        }
        .deco-panel {
          background: var(--deco-ink-2);
          border: 1px solid color-mix(in oklab, var(--deco-brass) 30%, transparent);
          clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
        }
        .deco-input {
          background: var(--deco-ink);
          border: 1px solid color-mix(in oklab, var(--deco-brass) 35%, transparent);
          color: var(--deco-porcelain);
        }
        .deco-input::placeholder { color: var(--deco-muted); }
        .deco-input:focus {
          border-color: var(--deco-brass);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--deco-brass) 25%, transparent);
        }
        .deco-cta {
          background: var(--deco-emerald);
          color: #06110B;
        }
        .deco-hairline {
          height: 1px;
          background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--deco-brass) 45%, transparent) 20%, color-mix(in oklab, var(--deco-brass) 45%, transparent) 80%, transparent);
        }
      `}</style>
    </main>
  );
}
