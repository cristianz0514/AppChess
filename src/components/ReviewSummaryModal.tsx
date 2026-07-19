"use client";

import { useEffect, useState } from "react";
import { X, Play, Sparkles } from "lucide-react";

const COLOR: Record<string, string> = {
  brilliant: "#1BAAA6", great: "#5C8AE6", best: "var(--bv-green)",
  excellent: "var(--bv-green)", good: "var(--bv-green)", inaccuracy: "#e0a800",
  mistake: "var(--bv-orange)", blunder: "var(--bv-red)",
};
const GLYPH: Record<string, string> = {
  brilliant: "‼", great: "!", best: "✓", excellent: "✓", good: "✓",
  inaccuracy: "?!", mistake: "?", blunder: "✕",
};
const ROWS: { key: string; label: string }[] = [
  { key: "brilliant", label: "Brillante" },
  { key: "great", label: "Genial" },
  { key: "best", label: "Mejor" },
  { key: "excellent", label: "Excelente" },
  { key: "good", label: "Bien" },
  { key: "inaccuracy", label: "Imprecisión" },
  { key: "mistake", label: "Error" },
  { key: "blunder", label: "Error grave" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onReviewMoments: () => void;
  accuracy: number | null;
  avgAccuracy: number | null;
  counts: Record<string, number>;
  // Opponent's own classification breakdown + both sides' estimated
  // performance Elo — chess.com's Game Review always grades both players,
  // not just the one you're tracking; these are optional so older call
  // sites without this data still render the single-column view.
  theirCounts?: Record<string, number>;
  myEloEstimate?: number | null;
  theirEloEstimate?: number | null;
  momentsCount: number;
  gameResult?: "win" | "loss" | "draw";
}

export function ReviewSummaryModal({ open, onClose, onReviewMoments, accuracy, avgAccuracy, counts, theirCounts, myEloEstimate, theirEloEstimate, momentsCount, gameResult }: Props) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const [displayAcc, setDisplayAcc] = useState(0);

  useEffect(() => {
    if (open) {
      setRender(true);
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Count the precisión up from 0 when the modal appears (premium micro-interaction).
  useEffect(() => {
    if (!shown || accuracy == null) { setDisplayAcc(accuracy ?? 0); return; }
    const target = accuracy;
    const start = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayAcc(Math.round(target * eased * 10) / 10);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, accuracy]);

  if (!render) return null;

  const acc = accuracy ?? 0;
  const headline =
    accuracy == null ? "Partida analizada"
      : acc >= 90 ? "¡Partida brillante!"
      : acc >= 80 ? "¡Buena partida!"
      : acc >= 68 ? "Partida sólida"
      : "Partida para revisar";
  const accDelta = accuracy != null && avgAccuracy != null ? Math.round((accuracy - avgAccuracy) * 10) / 10 : null;
  const resultLabel = gameResult === "win" ? "Victoria" : gameResult === "loss" ? "Derrota" : gameResult === "draw" ? "Tablas" : null;
  const resultColor = gameResult === "win" ? "var(--bv-green)" : gameResult === "loss" ? "var(--bv-red)" : "var(--bv-orange)";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(24,20,34,0.5)", backdropFilter: "blur(2px)", opacity: shown ? 1 : 0, transition: "opacity .26s ease" }}
      />
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-hidden"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
          transform: shown ? "translateY(0) scale(1)" : "translateY(6%) scale(0.98)",
          opacity: shown ? 1 : 0,
          transition: "transform .28s cubic-bezier(0.16,1,0.3,1), opacity .2s ease",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header — gradient hero */}
        <div className="relative px-5 pt-4 pb-5"
          style={{ background: "linear-gradient(135deg, oklch(0.34 0.10 264 / 0.14), oklch(0.60 0.11 184 / 0.10))" }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full sm:hidden" style={{ background: "var(--border)" }} />
          <button onClick={onClose} aria-label="Cerrar"
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} style={{ color: "var(--bv-purple)" }} />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
              Revisión de partida
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xl font-display font-bold leading-tight">{headline}</p>
              {resultLabel && (
                <span className="text-xs font-bold" style={{ color: resultColor }}>{resultLabel}</span>
              )}
            </div>
            <div className="text-right">
              <p className="text-4xl font-display font-bold leading-none" style={{ color: "var(--bv-green)" }}>
                {accuracy != null ? displayAcc.toFixed(1) : "—"}<span className="text-lg">%</span>
              </p>
              <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground mt-0.5">Precisión</p>
              {accDelta != null && (
                <p className="text-[10px] font-semibold" style={{ color: accDelta >= 0 ? "var(--bv-green)" : "var(--bv-red)" }}>
                  {accDelta >= 0 ? "+" : ""}{accDelta}% vs tu promedio
                </p>
              )}
            </div>
          </div>

          {/* Estimated performance Elo for BOTH sides — same idea as
              chess.com's "Estimated Elo Performance", from average
              centipawn loss (see eloEstimate.ts). Approximate, so it's
              labeled as an estimate rather than a real rating. */}
          {(myEloEstimate != null || theirEloEstimate != null) && (
            <div className="mt-3 pt-3 flex items-center justify-around" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="text-center">
                <p className="text-lg font-display font-bold leading-none">{myEloEstimate ?? "—"}</p>
                <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground mt-1">Tu Elo estimado</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-display font-bold leading-none">{theirEloEstimate ?? "—"}</p>
                <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground mt-1">Elo del rival</p>
              </div>
            </div>
          )}
        </div>

        {/* Classification breakdown. With `theirCounts` (both sides graded,
            chess.com-style): one row per category with the opponent's count
            on the left and yours on the right, flanking a shared label —
            without it (older/simpler call sites), the original single
            column. */}
        {theirCounts ? (
          <div className="px-5 py-3">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Rival</span>
              <span className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Tú</span>
            </div>
            <div className="space-y-1.5">
              {ROWS.map(({ key, label }, i) => (
                <div key={key} className="flex items-center gap-2"
                  style={{
                    opacity: shown ? 1 : 0,
                    transform: shown ? "translateY(0)" : "translateY(4px)",
                    transition: `opacity .3s ease ${0.12 + i * 0.04}s, transform .3s ease ${0.12 + i * 0.04}s`,
                  }}>
                  <span className="w-6 text-sm font-bold tabular-nums text-right" style={{ color: COLOR[key] }}>
                    {theirCounts[key] ?? 0}
                  </span>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: COLOR[key] }}>
                    {GLYPH[key]}
                  </span>
                  <span className="text-sm flex-1 text-center text-muted-foreground truncate">{label}</span>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: COLOR[key] }}>
                    {GLYPH[key]}
                  </span>
                  <span className="w-6 text-sm font-bold tabular-nums">{counts[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {ROWS.map(({ key, label }, i) => (
              <div key={key} className="flex items-center gap-2.5"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? "translateY(0)" : "translateY(4px)",
                  transition: `opacity .3s ease ${0.12 + i * 0.04}s, transform .3s ease ${0.12 + i * 0.04}s`,
                }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: COLOR[key] }}>
                  {GLYPH[key]}
                </span>
                <span className="text-sm flex-1 text-muted-foreground">{label}</span>
                <span className="text-sm font-bold tabular-nums">{counts[key] ?? 0}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          {momentsCount > 0 && (
            <button onClick={onReviewMoments}
              className="deco-step w-full py-3 text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "var(--bv-electric)" }}>
              <Play size={16} fill="#fff" /> Revivir los {momentsCount} momentos clave
            </button>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-semibold border transition-colors hover:bg-muted/40"
            style={{ borderColor: "var(--border)" }}>
            Ver jugada por jugada
          </button>
        </div>
      </div>
    </div>
  );
}
