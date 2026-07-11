"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Check, Lock, ExternalLink } from "lucide-react";
import { ChessBoard } from "./ChessBoard";
import { Piece } from "./pieces";
import { play as playSound } from "@/lib/sound";
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
  const [worlds, setWorlds] = useState(initialWorlds);
  const [active, setActive] = useState<{ world: number; node: RoadTripNode } | null>(null);
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

  function onNodeClick(worldIdx: number, node: RoadTripNode) {
    if (node.state === "locked") {
      toast("Completa el ejercicio anterior para desbloquear este");
      return;
    }
    setActive({ world: worldIdx, node });
  }

  function onSolved(puzzleId: string) {
    setWorlds((prev) => {
      const next = prev.map((w) => ({ ...w, nodes: [...w.nodes] }));
      for (let wi = 0; wi < next.length; wi++) {
        const idx = next[wi].nodes.findIndex((n) => n.id === puzzleId);
        if (idx === -1) continue;
        next[wi].nodes[idx] = { ...next[wi].nodes[idx], state: "done" };
        next[wi].solvedCount++;
        // Unlock the next node in this world.
        if (idx + 1 < next[wi].nodes.length && next[wi].nodes[idx + 1].state === "locked") {
          next[wi].nodes[idx + 1] = { ...next[wi].nodes[idx + 1], state: "current" };
        }
        // If this world is now fully solved, unlock the next world's first node.
        if (next[wi].solvedCount === next[wi].nodes.length && wi + 1 < next.length) {
          next[wi + 1].locked = false;
          if (next[wi + 1].nodes[0]?.state === "locked") {
            next[wi + 1].nodes[0] = { ...next[wi + 1].nodes[0], state: "current" };
          }
        }
      }
      return next;
    });
  }

  const totalSolved = worlds.reduce((s, w) => s + w.solvedCount, 0);
  const totalNodes = worlds.reduce((s, w) => s + w.nodes.length, 0);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Practica el Mate</p>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
          style={{ background: "oklch(0.61 0.22 285 / 0.12)", color: "var(--bv-purple)" }}>
          {totalSolved}/{totalNodes}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mb-6" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${totalNodes > 0 ? (totalSolved / totalNodes) * 100 : 0}%`, background: "linear-gradient(90deg, var(--bv-purple), var(--bv-green))" }} />
      </div>

      {worlds.map((world, wi) => (
        <div key={world.mateIn} className="mb-6">
          {/* World banner — frosted glass card */}
          <div className="mx-auto max-w-[280px] rounded-3xl p-5 text-center border shadow-sm mb-2"
            style={{
              background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)",
              borderColor: "oklch(0.61 0.22 285 / 0.12)",
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
              return (
                <div key={node.id} className="absolute flex flex-col items-center gap-1.5"
                  style={{ left: `${x}%`, top: `${y}px`, transform: "translate(-50%, -50%)" }}>
                  {node.state === "current" && (
                    <div className="absolute -top-9 px-3 py-1.5 rounded-xl text-[10px] font-bold text-white whitespace-nowrap"
                      style={{ background: "var(--foreground)", animation: "puzzleBob 1.6s ease-in-out infinite" }}>
                      Aquí vas
                    </div>
                  )}
                  <button
                    onClick={() => onNodeClick(wi, node)}
                    disabled={node.state === "locked"}
                    aria-label={node.state === "locked" ? "Ejercicio bloqueado" : `Ejercicio ${i + 1}`}
                    className="relative flex items-center justify-center rounded-full font-display font-bold transition-transform active:scale-95"
                    style={{
                      width: node.state === "current" ? 70 : 56,
                      height: node.state === "current" ? 70 : 56,
                      background: node.state === "done" ? "var(--bv-purple)" : node.state === "current" ? "var(--card)" : "var(--muted)",
                      color: node.state === "done" ? "#fff" : node.state === "current" ? "var(--bv-purple)" : "var(--muted-foreground)",
                      border: node.state === "current" ? "3px solid var(--bv-purple)" : "none",
                      boxShadow: node.state !== "locked" ? "0 1px 3px rgba(38,36,46,.10)" : undefined,
                      cursor: node.state === "locked" ? "not-allowed" : "pointer",
                      animation: node.state === "current" ? "puzzlePulse 2.1s ease-in-out infinite" : undefined,
                      outline: node.personal ? "3px solid var(--teal, #1BAAA6)" : undefined,
                      outlineOffset: node.personal ? 2 : undefined,
                    }}
                  >
                    {node.state === "done" ? <Check size={24} strokeWidth={3} /> : node.state === "locked" ? <Lock size={18} /> : i + 1}
                    {node.personal && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2"
                        style={{ background: "#1BAAA6", borderColor: "var(--background)" }}>
                        <span style={{ width: 10, height: 10, display: "block" }}><Piece type="p" white /></span>
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] font-semibold" style={{ color: node.personal ? "#1BAAA6" : "var(--muted-foreground)" }}>
                    {node.state === "locked" ? "—" : node.personal ? "De tu partida" : `Ej. ${i + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {active && (
        <PuzzleSheet
          node={active.node}
          onClose={() => setActive(null)}
          onSolved={() => { onSolved(active.node.id); }}
        />
      )}

      <div className="fixed left-1/2 z-[70] px-4 py-2.5 rounded-full text-xs font-semibold text-white transition-all"
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

// ── Puzzle-solving bottom sheet ──────────────────────────────────────────────

function uciSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function PuzzleSheet({ node, onClose, onSolved }: { node: RoadTripNode; onClose: () => void; onSolved: () => void }) {
  // Orient the board toward whoever is SOLVING (like chess.com/Lichess) —
  // about half of these puzzles have Black to move, and always showing White
  // at the bottom would leave the solver's own pieces at the top, confusing.
  // Derived from the puzzle's starting FEN (node doesn't change across this
  // mounted instance's lifetime) — must stay fixed, never flip mid-solve.
  const solverOrientation: "white" | "black" = node.fen.split(" ")[1] === "b" ? "black" : "white";
  const [fen, setFen] = useState(node.fen);
  const [step, setStep] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [showHintSq, setShowHintSq] = useState<string | null>(null);
  const [status, setStatus] = useState<"playing" | "solved">("playing");
  const [shake, setShake] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const mateWord = node.mateIn === 1 ? "1 jugada" : "2 jugadas";

  function handleMove(from: string, to: string) {
    if (status !== "playing") return;
    const expected = uciSquares(node.solution[step]);
    if (from !== expected.from || to !== expected.to) {
      setWrongTries((n) => n + 1);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      playSound("error");
      return;
    }

    // Correct — apply it.
    const c = new Chess(fen);
    let mv;
    try { mv = c.move({ from, to, promotion: "q" }); } catch { mv = null; }
    if (!mv) { setWrongTries((n) => n + 1); return; }

    setFen(c.fen());
    setLastMove({ from, to });
    setShowHintSq(null);

    const isLastStep = step + 1 >= node.solution.length;
    if (isLastStep) {
      setStatus("solved");
      playSound("brilliant");
      fetch("/api/puzzles/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: node.id, solved: true }),
      }).catch(() => {});
      onSolved();
      return;
    }

    if (node.mateIn === 2 && step === 0) {
      // Auto-play the opponent's forced reply after a short beat.
      const oppUci = node.solution[1];
      setTimeout(() => {
        const c2 = new Chess(c.fen());
        const oppSq = uciSquares(oppUci);
        try {
          const oppMv = c2.move({ from: oppSq.from, to: oppSq.to, promotion: "q" });
          if (oppMv) { setFen(c2.fen()); setLastMove(oppSq); }
        } catch { /* ignore */ }
        setStep(2);
      }, 450);
      setStep(1); // transient state while the opponent's move plays
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: "rgba(38,36,46,.45)" }} onClick={onClose} />
      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border max-h-[92vh] overflow-y-auto"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex justify-center pt-2.5"><div className="w-9 h-1 rounded-full" style={{ background: "var(--border)" }} /></div>
        <div className="flex items-center justify-between px-5 pt-2 pb-1">
          <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Mundo {node.mateIn} · {node.personal ? "De tu partida" : "Ejercicio"}
          </span>
          <button onClick={onClose} aria-label="Cerrar" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 text-muted-foreground">✕</button>
        </div>
        <div className="text-center px-5 pb-3">
          <h3 className="font-display text-2xl font-bold">
            {status === "solved" ? "¡Mate!" : `Buscas mate en ${mateWord}`}
          </h3>
          {status === "playing" && (
            <p className="text-xs text-muted-foreground mt-0.5">Toca tu pieza y luego la casilla de destino.</p>
          )}
        </div>

        <div className="px-5">
          <div className={shake ? "puzzle-shake" : ""}>
            <ChessBoard
              fen={fen}
              orientation={solverOrientation}
              interactive={status === "playing" && step !== 1 /* 1 = opponent auto-reply in progress */}
              onMove={handleMove}
              lastMove={lastMove}
            />
          </div>
        </div>

        <div className="px-5 pt-3" style={{ minHeight: 76 }}>
          {status === "playing" && wrongTries > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
              style={{ background: "oklch(0.63 0.23 25 / 0.10)", color: "var(--bv-red)" }}>
              Casi. Intenta de nuevo.
            </div>
          )}
          {status === "playing" && wrongTries >= 2 && (
            <button onClick={() => setShowHintSq(uciSquares(node.solution[step === 1 ? 0 : step]).from)}
              className="mt-2 w-full py-2 rounded-xl border text-xs font-semibold text-muted-foreground"
              style={{ borderColor: "var(--border)" }}>
              ¿Necesitas una pista?
            </button>
          )}
          {showHintSq && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Pista: la pieza correcta está en <b>{showHintSq}</b>.</p>
          )}
          {status === "solved" && (
            <div className="space-y-2">
              <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
                style={{ background: "oklch(0.77 0.17 177 / 0.12)", color: "var(--bv-green)" }}>
                <Check size={16} /> Jugada correcta.
              </div>
              {node.personal && node.gameId && (
                <div className="rounded-xl p-3" style={{ background: "rgba(27,170,166,.10)", border: "1px solid rgba(27,170,166,.25)" }}>
                  <p className="text-xs leading-relaxed">Esta posición viene de una de tus partidas analizadas.</p>
                  <Link href={`/blunders/${node.gameId}`} className="inline-flex items-center gap-1 text-xs font-bold mt-1.5" style={{ color: "#1BAAA6" }}>
                    Ver la partida completa <ExternalLink size={12} />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5">
          {status === "solved" ? (
            <button onClick={onClose} className="w-full py-3.5 rounded-2xl font-bold text-white" style={{ background: "var(--bv-purple)" }}>
              Siguiente ejercicio →
            </button>
          ) : (
            <div style={{ height: 0 }} />
          )}
        </div>
      </div>
      <style>{`
        .puzzle-shake { animation: puzzleShake .4s ease; }
        @keyframes puzzleShake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
