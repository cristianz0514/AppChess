"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Star } from "lucide-react";
import type { RoadTripWorld, RoadTripNode } from "@/services/puzzleProgress";

interface Props {
  worlds: RoadTripWorld[];
}

// Abstract coordinate system for the winding path — an SVG viewBox and the
// HTML node overlay share these units, so the same path shape scales to any
// screen width and to any NUMBER of puzzles (no fixed background artwork).
const ROW = 130;
const TOP_PAD = 40;
const AMP = 26; // how far nodes swing left/right of center, in viewBox units (0-100 wide)

function nodeXY(i: number): { x: number; y: number } {
  return { x: 50 + AMP * Math.sin(i * 0.9), y: TOP_PAD + i * ROW };
}

function buildPathD(nodes: RoadTripNode[]): string {
  if (nodes.length === 0) return "";
  const pts = nodes.map((_, i) => nodeXY(i));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const midY = (pts[i - 1].y + pts[i].y) / 2;
    d += ` C ${pts[i - 1].x} ${midY}, ${pts[i].x} ${midY}, ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export function PuzzleRoadTrip({ worlds: initialWorlds }: Props) {
  const router = useRouter();
  const [worlds, setWorlds] = useState(initialWorlds);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // `useState(initialWorlds)` only seeds state on first mount — a later
  // `router.refresh()` (from BackgroundSeeder, once it tops up more puzzles)
  // passes a NEW `worlds` prop, but plain useState would silently ignore it.
  // Sync local state whenever the server sends fresh data, so newly-seeded
  // nodes actually appear on the path without a manual reload.
  useEffect(() => {
    setWorlds(initialWorlds);
  }, [initialWorlds]);

  function toast(msg: string) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }

  function onNodeClick(node: RoadTripNode) {
    if (node.state === "locked") {
      toast("Completa el ejercicio anterior para desbloquear este");
      return;
    }
    // A real navigation, not a bottom sheet — the puzzle opens as its own
    // full page (matches how /blunders/[id] works) and progress is re-read
    // fresh from the server every time this road trip page is revisited.
    router.push(`/practica-mate/${node.id}`);
  }

  const totalSolved = worlds.reduce((s, w) => s + w.solvedCount, 0);
  const totalNodes = worlds.reduce((s, w) => s + w.nodes.length, 0);

  return (
    <div className="relative">
      {/* Progress summary now lives in the page's fixed header (chip + %) —
          just the thin bar stays here as a visual anchor under it. */}
      <div className="h-1.5 rounded-full overflow-hidden mb-6" style={{ background: "var(--border)" }}>
        <div className="h-full w-full rounded-full transition duration-500"
          style={{ transform: `scaleX(${totalNodes > 0 ? totalSolved / totalNodes : 0})`, transformOrigin: "left", background: "linear-gradient(90deg, var(--bv-purple), var(--bv-green))" }} />
      </div>

      {worlds.map((world, wi) => (
        <div key={world.mateIn} className="mb-6">
          {/* World banner — frosted glass card */}
          <div className="mx-auto max-w-[300px] rounded-3xl p-6 text-center border mb-2"
            style={{
              background: "rgba(255,255,255,0.95)", backdropFilter: "blur(10px)",
              borderColor: "oklch(0.61 0.22 285 / 0.10)",
              boxShadow: world.locked ? "0 8px 20px -8px rgba(38,36,46,.12)" : "0 20px 40px -14px oklch(0.42 0.20 288 / 0.35)",
              filter: world.locked ? "grayscale(0.5)" : undefined,
              opacity: world.locked ? 0.55 : 1,
            }}>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1" style={{ color: "var(--bv-purple)" }}>
              Mundo {world.mateIn}
            </p>
            <h2 className="font-display text-2xl font-bold mb-1">{world.title}</h2>
            <p className="text-xs text-muted-foreground mb-3 leading-snug">{world.subtitle}</p>
            {world.locked ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <Lock size={13} /> Completa el mundo anterior
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ background: "oklch(0.61 0.22 285 / 0.10)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--bv-purple)" }} />
                <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--bv-purple)" }}>
                  {world.solvedCount}/{world.nodes.length} resueltos
                </span>
              </div>
            )}
          </div>

          {/* Winding path */}
          <div className="relative" style={{ height: TOP_PAD + world.nodes.length * ROW }}>
            <svg viewBox={`0 0 100 ${TOP_PAD + world.nodes.length * ROW}`} preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full" aria-hidden>
              <path d={buildPathD(world.nodes)} fill="none" stroke="var(--border)" strokeWidth="1.6" strokeDasharray="3 4"
                opacity={world.locked ? 0.4 : 1} />
              <path
                d={buildPathD(world.nodes.slice(0, Math.max(0, world.solvedCount + 1)))}
                fill="none" stroke="var(--bv-purple)" strokeWidth="1.8" strokeLinecap="round" opacity={world.locked ? 0.3 : 0.6}
              />
            </svg>

            {world.nodes.map((node, i) => {
              const { x, y } = nodeXY(i);
              const isPersonal = node.personal && node.state !== "locked";
              const isCurrent = node.state === "current";
              const isDone = node.state === "done";
              const size = isCurrent ? 80 : isPersonal ? 64 : 56;

              return (
                <div key={node.id} className="absolute flex flex-col items-center gap-2"
                  style={{ left: `${x}%`, top: `${y}px`, transform: "translate(-50%, -50%)" }}>
                  {isCurrent && (
                    <div className="absolute -top-11 flex flex-col items-center" style={{ animation: "puzzleBob 1.6s ease-in-out infinite" }}>
                      <div className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold text-white whitespace-nowrap shadow-lg"
                        style={{ background: "var(--foreground)" }}>
                        Aquí vas
                      </div>
                      {/* Speech-bubble tail pointing down at the node */}
                      <div style={{
                        width: 0, height: 0, marginTop: -1,
                        borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                        borderTop: "6px solid var(--foreground)",
                      }} />
                    </div>
                  )}
                  <button
                    onClick={() => onNodeClick(node)}
                    disabled={node.state === "locked"}
                    aria-label={node.state === "locked" ? "Ejercicio bloqueado" : `Ejercicio ${i + 1}`}
                    className="relative flex items-center justify-center rounded-full font-display font-bold transition-transform active:scale-95"
                    style={{
                      width: size,
                      height: size,
                      background: isPersonal ? "#1BAAA6" : isDone ? "var(--bv-purple)" : isCurrent ? "var(--card)" : "rgba(30,27,40,0.32)",
                      color: isPersonal || isDone ? "#fff" : isCurrent ? "var(--bv-purple)" : "rgba(255,255,255,0.9)",
                      border: isCurrent ? "6px solid var(--bv-purple)" : isPersonal ? "2px solid rgba(27,170,166,0.35)" : "none",
                      boxShadow: isCurrent
                        ? "0 20px 30px -10px oklch(0.42 0.20 288 / 0.45)"
                        : isPersonal
                          ? "0 0 0 4px rgba(255,255,255,0.85), 0 10px 22px -8px rgba(27,170,166,.45)"
                          : isDone
                            ? "0 0 0 4px rgba(255,255,255,0.6), 0 6px 14px -4px oklch(0.42 0.20 288 / 0.45)"
                            : "inset 0 2px 5px rgba(0,0,0,0.3)",
                      backdropFilter: node.state === "locked" ? "blur(6px)" : undefined,
                      cursor: node.state === "locked" ? "not-allowed" : "pointer",
                      animation: isCurrent ? "puzzlePulse 2.1s ease-in-out infinite" : undefined,
                    }}
                  >
                    {isPersonal ? <Star size={isCurrent ? 30 : 26} strokeWidth={2.4} fill="currentColor" />
                      : isDone ? <Check size={24} strokeWidth={3} />
                      : node.state === "locked" ? <Lock size={18} />
                      : i + 1}
                    {isPersonal && (
                      <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2"
                        style={{ background: "#fff", borderColor: "#1BAAA6" }}>
                        <Star size={12} strokeWidth={2.5} fill="#1BAAA6" style={{ color: "#1BAAA6" }} />
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm"
                    style={{
                      background: node.state === "locked" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.85)",
                      backdropFilter: "blur(4px)",
                      color: isPersonal ? "#1BAAA6" : "var(--muted-foreground)",
                    }}>
                    {node.state === "locked" ? "—" : isPersonal ? "De tu partida" : `Ej. ${i + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="fixed left-1/2 z-[70] px-4 py-2.5 rounded-full text-xs font-semibold text-white transition"
        style={{
          bottom: 26, transform: `translateX(-50%) translateY(${toastMsg ? "0" : "16px"})`,
          background: "var(--foreground)", opacity: toastMsg ? 1 : 0, pointerEvents: "none",
        }}>
        {toastMsg}
      </div>

      <style>{`
        @keyframes puzzlePulse {
          0%, 100% { box-shadow: 0 0 0 0 oklch(0.61 0.22 285 / 0.35); }
          50% { box-shadow: 0 0 0 10px oklch(0.61 0.22 285 / 0); }
        }
        @keyframes puzzleBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; }
        }
      `}</style>
    </div>
  );
}
