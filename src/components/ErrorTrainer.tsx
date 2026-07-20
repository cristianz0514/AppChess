"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Check, Lightbulb, ExternalLink, RotateCcw } from "lucide-react";
import { ChessBoard } from "./ChessBoard";
import { play as playSound } from "@/lib/sound";
import type { ErrorExercise } from "@/services/errorTrainer";

interface Solution {
  bestUci: string;
  bestSan: string | null;
  acceptable: string[]; // "from+to" strings within half a pawn of best
}

const STORAGE_KEY = "bv_error_solved";

function loadSolved(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function persistSolved(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

export function ErrorTrainer({ exercises }: { exercises: ErrorExercise[] }) {
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [solution, setSolution] = useState<Solution | null>(null);
  const [solutionError, setSolutionError] = useState(false);
  const [status, setStatus] = useState<"loading" | "playing" | "correct" | "revealed">("loading");
  const [wrongTries, setWrongTries] = useState(0);
  const [fen, setFen] = useState(exercises[0]?.fen ?? "");
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [shake, setShake] = useState(false);

  const ex = exercises[index];

  useEffect(() => { setSolved(loadSolved()); }, []);

  // Load this exercise's solution (best move + acceptable set) on demand.
  useEffect(() => {
    if (!ex) return;
    let cancelled = false;
    setStatus("loading");
    setSolution(null);
    setSolutionError(false);
    setWrongTries(0);
    setFen(ex.fen);
    setLastMove(null);
    fetch("/api/exercise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: ex.fen }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Solution) => {
        if (cancelled) return;
        setSolution(d);
        setStatus("playing");
      })
      .catch(() => { if (!cancelled) { setSolutionError(true); setStatus("playing"); } });
    return () => { cancelled = true; };
  }, [ex]);

  const markSolved = useCallback((id: string) => {
    setSolved((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistSolved(next);
      return next;
    });
  }, []);

  function playMoveOnBoard(uci: string) {
    const c = new Chess(ex.fen);
    try {
      const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4, 5) : "q" });
      if (mv) { setFen(c.fen()); setLastMove({ from: mv.from, to: mv.to }); }
    } catch { /* ignore */ }
  }

  function handleMove(from: string, to: string, promotion?: "q" | "r" | "b" | "n") {
    if (status !== "playing" || !solution) return;
    const key = `${from}${to}`;
    if (solution.acceptable.includes(key)) {
      // Show the move played, mark solved, celebrate.
      const c = new Chess(ex.fen);
      try {
        const mv = c.move({ from, to, promotion: promotion ?? "q" });
        if (mv) { setFen(c.fen()); setLastMove({ from, to }); }
      } catch { /* ignore */ }
      setStatus("correct");
      markSolved(ex.id);
      playSound("brilliant");
    } else {
      setWrongTries((n) => n + 1);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      playSound("error");
    }
  }

  function reveal() {
    if (!solution) return;
    playMoveOnBoard(solution.bestUci);
    setStatus("revealed");
  }

  function go(next: number) {
    setIndex(Math.max(0, Math.min(exercises.length - 1, next)));
  }

  if (!ex) return null;

  const solvedCount = exercises.filter((e) => solved.has(e.id)).length;
  const alreadySolved = solved.has(ex.id);

  return (
    <div className="space-y-3 pb-6">
      {/* Progress */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">
          Ejercicio {index + 1} / {exercises.length}
        </p>
        <p className="text-[11px] font-bold tabular-nums" style={{ color: "var(--bv-electric)" }}>
          {solvedCount} resueltos
        </p>
      </div>

      <div className="text-center px-1">
        <h1 className="font-deco text-2xl uppercase">
          {status === "correct" || status === "revealed" ? "¡Esa es!" : "Encuentra la mejor jugada"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ex.opening ? `${ex.opening} · ` : ""}Jugaste <span className="font-mono font-semibold">{ex.playedSan}</span> y perdiste ventaja.
        </p>
      </div>

      <div className={`-mx-4 ${shake ? "puzzle-shake" : ""}`}>
        <ChessBoard
          fen={fen}
          orientation={ex.orientation}
          interactive={status === "playing"}
          onMove={handleMove}
          lastMove={lastMove}
        />
      </div>

      <div style={{ minHeight: 92 }} className="space-y-2">
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <span className="w-4 h-4 rounded-full border-2 animate-spin inline-block"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--bv-electric)" }} />
            Analizando la posición…
          </div>
        )}

        {status === "playing" && (
          <>
            {solutionError && (
              <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "oklch(0.70 0.18 50 / 0.12)", color: "var(--bv-orange)" }}>
                No se pudo analizar esta posición. Pasa a la siguiente.
              </div>
            )}
            {wrongTries > 0 && !solutionError && (
              <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
                style={{ background: "oklch(0.63 0.23 25 / 0.10)", color: "var(--bv-red)" }}>
                Esa no mejora la posición. Intenta otra.
              </div>
            )}
            {wrongTries >= 2 && !solutionError && (
              <button onClick={reveal}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: "var(--bv-electric)", color: "var(--bv-electric)" }}>
                <Lightbulb size={15} /> Ver la mejor jugada
              </button>
            )}
          </>
        )}

        {(status === "correct" || status === "revealed") && (
          <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
            style={{
              background: status === "correct" ? "oklch(0.77 0.17 177 / 0.12)" : "oklch(0.34 0.10 264 / 0.10)",
              color: status === "correct" ? "var(--bv-green)" : "var(--bv-purple)",
            }}>
            {status === "correct" ? <Check size={16} /> : <Lightbulb size={16} />}
            {status === "correct"
              ? "Correcto — esa mantiene la ventaja."
              : solution?.bestSan ? `La mejor era ${solution.bestSan}.` : "Esa era la mejor jugada."}
          </div>
        )}

        <Link href={`/blunders/${ex.gameId}?blunder=1`}
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Ver esta partida completa <ExternalLink size={12} />
        </Link>
      </div>

      {/* Nav */}
      <div className="flex items-center gap-2">
        {index > 0 && (
          <button onClick={() => go(index - 1)}
            className="deco-step-sm flex-1 py-3 text-sm font-bold border transition active:scale-[0.98]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            Anterior
          </button>
        )}
        {(status === "correct" || status === "revealed" || alreadySolved) && index < exercises.length - 1 ? (
          <button onClick={() => go(index + 1)}
            className="deco-step-sm flex-[2] py-3 text-white font-bold transition active:scale-[0.98]"
            style={{ background: "var(--bv-electric)" }}>
            Siguiente ejercicio →
          </button>
        ) : index < exercises.length - 1 ? (
          <button onClick={() => go(index + 1)}
            className="deco-step-sm flex-1 py-3 text-sm font-bold border transition active:scale-[0.98]"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            Saltar
          </button>
        ) : (
          <Link href="/entrenamiento"
            className="deco-step-sm flex-[2] py-3 text-center text-white font-bold transition active:scale-[0.98]"
            style={{ background: "var(--bv-electric)" }}>
            Terminar
          </Link>
        )}
        {(status === "correct" || status === "revealed") && (
          <button onClick={() => { setStatus("playing"); setFen(ex.fen); setLastMove(null); setWrongTries(0); }}
            aria-label="Reintentar" title="Reintentar"
            className="deco-step-sm py-3 px-4 border transition active:scale-[0.98]"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            <RotateCcw size={16} />
          </button>
        )}
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
