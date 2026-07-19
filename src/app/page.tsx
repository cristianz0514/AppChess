"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Big_Shoulders } from "next/font/google";
import { trackGamesImported } from "@/lib/installTracking";

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

// The one signature motion moment on this page — everything else is a
// plain fade. Two layers, on purpose (see apple-design's damping guidance):
// an entrance where the rays draw themselves in (a one-shot, no-bounce
// reveal — this is a passive page load, not a gesture, so no overshoot),
// then a near-imperceptible ambient rotation once settled. Both are
// disabled under prefers-reduced-motion in favor of a plain fade — see the
// .deco-page stylesheet below.
function Sunburst() {
  const rayCount = 20;
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className="absolute pointer-events-none"
      // width/height == viewBox (1:1 scale) so ray lengths below are real
      // px. top is set so the svg's own center (100,100 in viewbox units)
      // lands exactly on the medallion's center: container is 96px tall,
      // medallion is centered in it (center at local y=48), so
      // top = 48 - height/2. Outer ray length is capped so the lowest tip
      // (center + outer) stays clear of the eyebrow text under measured
      // real layout, not eyeballed — see the mb-8 below too.
      style={{ width: 200, height: 200, top: 48 - 100, left: "50%", transform: "translateX(-50%)" }}
    >
      {/* Rotates as one unit — origin pinned to the svg's own center so it
          spins in place around the medallion rather than orbiting it. */}
      <g className="deco-sunburst-spin" style={{ transformOrigin: "100px 100px" }}>
        {Array.from({ length: rayCount }).map((_, i) => {
          const angle = (i / rayCount) * Math.PI * 2;
          const inner = 44;
          const outer = i % 2 === 0 ? 68 : 55;
          // Rounded to 2dp — SSR/CSR can otherwise disagree on the last digit
          // of the raw float (Node vs browser rounding), which trips a
          // hydration mismatch even though the geometry is identical.
          const x1 = +(100 + Math.cos(angle) * inner).toFixed(2);
          const y1 = +(100 + Math.sin(angle) * inner).toFixed(2);
          const x2 = +(100 + Math.cos(angle) * outer).toFixed(2);
          const y2 = +(100 + Math.sin(angle) * outer).toFixed(2);
          const len = +(outer - inner).toFixed(2);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              className="deco-ray"
              stroke={i % 2 === 0 ? "var(--deco-navy)" : "var(--deco-black)"}
              strokeWidth={1.25} strokeLinecap="round"
              style={{
                strokeDasharray: len,
                strokeDashoffset: len,
                // Fan outward from the top (i=0) both ways, so the draw-in
                // reads as radiating from a single point, not a left-to-right
                // wipe around the circle.
                animationDelay: `${0.15 + Math.min(i, rayCount - i) * 0.035}s`,
              }}
            />
          );
        })}
      </g>
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

  return (
    <main className={`${decoDisplay.variable} deco-page h-dvh overflow-hidden flex flex-col items-center justify-center px-5 text-center relative`}
      style={{ animation: "bvFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        <div className="relative mb-6 flex items-center justify-center" style={{ width: 96, height: 96 }}>
          <Sunburst />
          <div className="deco-medallion deco-medallion-in relative w-20 h-20 flex items-center justify-center select-none"
            style={{ background: "var(--deco-bg)" }}>
            <span className="deco-knight-in text-4xl leading-none" style={{ color: "var(--deco-navy)" }}>♞</span>
          </div>
        </div>

        <p className="deco-mono text-[11px] font-bold tracking-[0.28em] uppercase mb-3" style={{ color: "var(--deco-navy)" }}>
          Tu entrenador de ajedrez con IA
        </p>

        <h1 className="deco-display text-[26px] leading-[1.15] mb-3 text-balance max-w-[15rem] uppercase" style={{ color: "var(--deco-black)" }}>
          Descubre dónde se te <span style={{ color: "var(--deco-accent)" }}>escapan</span> las partidas
        </h1>

        <p className="text-base max-w-xs leading-snug mb-6" style={{ color: "var(--deco-muted)" }}>
          Conecta tu cuenta de Chess.com.
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
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                {phase || "Importando tu historial…"}
              </span>
            ) : "Ver mis partidas →"}
          </button>

          {/* Real progress feedback — a full-history import can take a while;
              this is what keeps it from ever looking frozen/failed. */}
          {loading && (
            <div className="space-y-1.5">
              <div className="w-full h-1 overflow-hidden" style={{ background: "color-mix(in oklab, var(--deco-black) 15%, transparent)" }}>
                <div
                  className="h-full transition duration-300"
                  style={{
                    width: pct != null ? "100%" : "30%",
                    transform: pct != null ? `scaleX(${pct / 100})` : undefined,
                    transformOrigin: "left",
                    background: "linear-gradient(90deg, var(--deco-black), var(--deco-accent))",
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
            <p className="text-xs text-center" style={{ color: "var(--destructive)" }}>{error}</p>
          )}
        </form>

        <p className="deco-mono text-[10px] tracking-[0.12em] uppercase mt-4" style={{ color: "var(--deco-muted)" }}>
          Gratis · Sin registro · Todo tu historial público
        </p>

      <style>{`
        .deco-page {
          --deco-bg: var(--background);
          --deco-black: #1C2430;
          --deco-navy: #2B3A55;
          --deco-muted: #5B6472;
          --deco-accent: #4A5EE8;
          background: var(--deco-bg);
          color: var(--deco-black);
        }
        .deco-display {
          font-family: var(--font-deco-display), sans-serif;
          font-weight: 700;
          letter-spacing: 0;
        }
        .deco-mono { font-family: var(--font-geist-mono), monospace; }

        /* Signature shape: a single-cut chevron corner — reused for the
           monogram, the form panel, and the CTA below. */
        .deco-medallion {
          clip-path: polygon(18% 0, 100% 0, 100% 82%, 82% 100%, 0 100%, 0 18%);
          border: 1.5px solid var(--deco-black);
        }
        .deco-panel {
          background: var(--deco-bg);
          border: 1.5px solid var(--deco-black);
          clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
        }
        .deco-input {
          background: var(--deco-bg);
          border: 1px solid color-mix(in oklab, var(--deco-black) 35%, transparent);
          color: var(--deco-black);
        }
        .deco-input::placeholder { color: var(--deco-muted); }
        .deco-input:focus {
          border-color: var(--deco-accent);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--deco-accent) 22%, transparent);
        }
        .deco-cta {
          background: var(--deco-accent);
          color: #FFFFFF;
          clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
        }
        /* Logo signature motion — an assembly sequence (rays fan out, the
           medallion frame materializes, the knight fades in last), then a
           near-imperceptible ambient spin once it's settled. A passive
           page-load reveal, not a gesture, so no bounce/overshoot —
           critically-damped easing throughout (see apple-design's damping
           guidance: reserve bounce for momentum-driven interactions). */
        .deco-ray {
          animation: decoRayDraw 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes decoRayDraw {
          to { stroke-dashoffset: 0; }
        }
        .deco-sunburst-spin {
          animation: decoSunburstSpin 48s linear infinite;
          animation-delay: 1.2s;
        }
        @keyframes decoSunburstSpin {
          to { transform: rotate(360deg); }
        }
        .deco-medallion-in {
          animation: decoMedallionIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
        }
        @keyframes decoMedallionIn {
          from { transform: scale(0.82); opacity: 0; }
        }
        .deco-knight-in {
          display: inline-block;
          animation: decoKnightIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.75s both;
        }
        @keyframes decoKnightIn {
          from { transform: scale(0.7); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .deco-medallion-in, .deco-knight-in, .deco-sunburst-spin { animation: none; }
          .deco-ray { animation: none; stroke-dashoffset: 0 !important; }
        }
      `}</style>
    </main>
  );
}
