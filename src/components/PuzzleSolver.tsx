"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chess } from "chess.js";
import { Check, ExternalLink } from "lucide-react";
import { ChessBoard } from "./ChessBoard";
import { play as playSound } from "@/lib/sound";
import type { RoadTripNode } from "@/services/puzzleProgress";

function uciSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
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
  const [step, setStep] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [showHintSq, setShowHintSq] = useState<string | null>(null);
  const [status, setStatus] = useState<"playing" | "solved">("playing");
  const [shake, setShake] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  // Same chess.com-style badge the analysis board draws on the destination
  // square of a classified move — puzzles don't have a "classification", but
  // a correct/mating move is exactly as signal-worthy, so it gets one too.
  const [badge, setBadge] = useState<{ emoji: string; color: string } | null>(null);

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
      setBadge({ emoji: "‼", color: "#1BAAA6" });
      playSound("brilliant");
      fetch("/api/puzzles/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: node.id, solved: true }),
      }).catch(() => {});
      return;
    }

    setBadge({ emoji: "✓", color: "var(--bv-green)" });

    if (node.mateIn === 2 && step === 0) {
      // Auto-play the opponent's forced reply after a short beat.
      const oppUci = node.solution[1];
      setTimeout(() => {
        const c2 = new Chess(c.fen());
        const oppSq = uciSquares(oppUci);
        try {
          const oppMv = c2.move({ from: oppSq.from, to: oppSq.to, promotion: "q" });
          if (oppMv) { setFen(c2.fen()); setLastMove(oppSq); setBadge(null); }
        } catch { /* ignore */ }
        setStep(2);
      }, 450);
      setStep(1); // transient state while the opponent's move plays
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="text-center px-1">
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
          interactive={status === "playing" && step !== 1 /* 1 = opponent auto-reply in progress */}
          onMove={handleMove}
          lastMove={lastMove}
          lastMoveBadge={badge}
        />
      </div>

      <div style={{ minHeight: 76 }}>
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
