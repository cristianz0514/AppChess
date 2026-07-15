"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chess } from "chess.js";
import { Check, ExternalLink, Lightbulb } from "lucide-react";
import { ChessBoard } from "./ChessBoard";
import { play as playSound } from "@/lib/sound";
import type { RoadTripNode } from "@/services/puzzleProgress";

function uciSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// Lichess UCI encodes a required promotion as a 5th character (e.g. "g7g8q").
// Most of our mate puzzles promote to queen, but not all — validate whatever
// the solution actually specifies instead of assuming "q".
function uciPromotion(uci: string): "q" | "r" | "b" | "n" {
  const p = uci[4];
  return p === "r" || p === "b" || p === "n" ? p : "q";
}

interface Props {
  node: RoadTripNode;
  nextNodeId: string | null;
}

// Full-page puzzle solver — the dedicated view a road-trip node navigates to
// (was a bottom sheet; moved to a real route so it opens like every other
// detail view in the app, not stuck docked at the bottom of the screen).
export function PuzzleSolver({ node, nextNodeId }: Props) {
  const router = useRouter();
  // Orient the board toward whoever is SOLVING (like chess.com/Lichess) —
  // about half of these puzzles have Black to move.
  const solverOrientation: "white" | "black" = node.fen.split(" ")[1] === "b" ? "black" : "white";
  const [fen, setFen] = useState(node.fen);
  // Index into node.solution the PLAYER must supply next — always an even
  // index (0, 2, 4, ...), since the player is the attacker and moves at
  // even plies while the opponent's forced replies auto-play at odd ones.
  // Generalizes to any mate-in-N (was hardcoded to a single mate-in-2 cycle).
  const [plyIndex, setPlyIndex] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  // Exactly one hint per puzzle — a dedicated "hint zone" instead of a
  // colored good/bad-move signal, which gave away too much of the solve
  // (especially in Mate en 1, where the whole puzzle is a single move).
  const [hintUsed, setHintUsed] = useState(false);
  const [showHintSq, setShowHintSq] = useState<string | null>(null);
  const [status, setStatus] = useState<"playing" | "solved">("playing");
  const [shake, setShake] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const mateWord = node.mateIn === 1 ? "1 jugada" : `${node.mateIn} jugadas`;

  function handleMove(from: string, to: string, promotion?: "q" | "r" | "b" | "n") {
    if (status !== "playing" || autoPlaying) return;
    const solutionUci = node.solution[plyIndex];
    const expected = uciSquares(solutionUci);
    const expectedPromo = uciPromotion(solutionUci);
    // A promotion move where the player picked a different piece than the
    // solution requires is just as wrong as the wrong square would be.
    if (from !== expected.from || to !== expected.to || (promotion && promotion !== expectedPromo)) {
      setWrongTries((n) => n + 1);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      playSound("error");
      return;
    }

    const c = new Chess(fen);
    let mv;
    try { mv = c.move({ from, to, promotion: expectedPromo }); } catch { mv = null; }
    if (!mv) { setWrongTries((n) => n + 1); return; }

    setFen(c.fen());
    setLastMove({ from, to });
    setShowHintSq(null);

    const afterPlayerIdx = plyIndex + 1;
    const isLastStep = afterPlayerIdx >= node.solution.length;
    if (!isLastStep && mv.san.includes("=")) playSound("promote");
    if (isLastStep) {
      setStatus("solved");
      playSound("brilliant");
      fetch("/api/puzzles/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: node.id, solved: true }),
      }).catch(() => {});
      return;
    }

    // There's a forced opponent reply next — auto-play it, then hand the
    // turn back for the player's following move (repeats for however many
    // moves this mate-in-N puzzle needs).
    setAutoPlaying(true);
    setTimeout(() => {
      const c2 = new Chess(c.fen());
      const oppUci = node.solution[afterPlayerIdx];
      const oppSq = uciSquares(oppUci);
      try {
        const oppMv = c2.move({ from: oppSq.from, to: oppSq.to, promotion: uciPromotion(oppUci) });
        if (oppMv) { setFen(c2.fen()); setLastMove(oppSq); }
      } catch { /* ignore */ }
      setPlyIndex(afterPlayerIdx + 1);
      setAutoPlaying(false);
    }, 450);
  }

  function useHint() {
    if (hintUsed) return;
    setHintUsed(true);
    setShowHintSq(uciSquares(node.solution[plyIndex]).from);
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="text-center px-1">
        {/* Which color the player is solving as isn't obvious from board
            orientation alone — about half these puzzles have Black to move,
            so say it explicitly instead of making the player infer it. */}
        <div className="flex items-center justify-center gap-1.5 mb-1.5">
          <span aria-hidden className="inline-block w-3 h-3 rounded-full border"
            style={{
              background: solverOrientation === "white" ? "#fff" : "#1a1a1a",
              borderColor: "var(--border)",
            }} />
          <span className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: "var(--muted-foreground)" }}>
            Juegas con {solverOrientation === "white" ? "blancas" : "negras"}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold text-balance">
          {status === "solved" ? "¡Jaque mate!" : `Buscas mate en ${mateWord}`}
        </h1>
        {status === "playing" && (
          <p className="text-xs text-muted-foreground mt-0.5">Toca tu pieza y luego la casilla de destino.</p>
        )}
      </div>

      {/* Full-bleed board — same edge-to-edge treatment as the analysis board,
          not shrunk into a small card. */}
      <div className={`-mx-4 ${shake ? "puzzle-shake" : ""}`}>
        <ChessBoard
          fen={fen}
          orientation={solverOrientation}
          interactive={status === "playing" && !autoPlaying}
          onMove={handleMove}
          lastMove={lastMove}
          hintSquare={showHintSq}
        />
      </div>

      <div style={{ minHeight: 76 }} className="space-y-2">
        {status === "playing" && wrongTries > 0 && (
          <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
            style={{ background: "oklch(0.63 0.23 25 / 0.10)", color: "var(--bv-red)" }}>
            Casi. Intenta de nuevo.
          </div>
        )}

        {/* Zona de pistas — exactamente 1 pista por ejercicio, no escala con
            los intentos fallidos (evita dar demasiadas señales de la solución). */}
        {status === "playing" && (
          <div className="rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Lightbulb size={15} style={{ color: hintUsed ? "var(--muted-foreground)" : "var(--bv-purple)" }} />
              {showHintSq ? (
                <span className="text-xs">Pista: la pieza correcta está en <b>{showHintSq}</b>.</span>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">Zona de pistas</span>
              )}
            </div>
            {!hintUsed && (
              <button onClick={useHint}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: "oklch(0.61 0.22 285 / 0.12)", color: "var(--bv-purple)" }}>
                Usar pista
              </button>
            )}
          </div>
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

      {status === "solved" && (
        <button
          onClick={() => router.push(nextNodeId ? `/practica-mate/${nextNodeId}` : "/practica-mate")}
          className="w-full py-3.5 rounded-2xl font-bold text-white transition-transform active:scale-[0.98]"
          style={{ background: "var(--bv-purple)" }}>
          {nextNodeId ? "Siguiente ejercicio →" : "Volver al camino →"}
        </button>
      )}

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
