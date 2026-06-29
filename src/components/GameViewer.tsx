"use client";

import { useState, useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import { ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import type { Game } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbMove {
  move_number: number;
  classification: string | null;
  centipawn_loss?: number | null;
  evaluation?: number | null;
}

interface MoveInfo {
  san: string;
  fen: string;
  moveNumber: number;
  color: "w" | "b";
  from: string;
  to: string;
  classification: string | null;
  centipawnLoss: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_COLOR: Record<string, string> = {
  blunder:    "#ff5757",
  mistake:    "#ff8c42",
  inaccuracy: "#ffd700",
  best:       "#00d4a1",
  excellent:  "#00d4a1",
  good:       "#00d4a1",
};

const CLASS_LABEL: Record<string, string> = {
  blunder:    "Error grave",
  mistake:    "Error",
  inaccuracy: "Inexactitud",
  best:       "Mejor jugada",
  excellent:  "Excelente",
  good:       "Buena",
};

const CLASS_EMOJI: Record<string, string> = {
  blunder: "??", mistake: "?", inaccuracy: "?!", best: "!!", excellent: "!", good: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMoves(pgn: string, dbMoves: DbMove[]): MoveInfo[] {
  const classMap = new Map<number, DbMove>();
  for (const m of dbMoves) classMap.set(m.move_number, m);

  const master = new Chess();
  try { master.loadPgn(pgn); } catch { return []; }
  const history = master.history({ verbose: true });

  const game = new Chess();
  return history.map((h, i) => {
    game.move(h.san);
    const db = classMap.get(i + 1);
    return {
      san: h.san,
      fen: game.fen(),
      moveNumber: Math.floor(i / 2) + 1,
      color: h.color as "w" | "b",
      from: h.from,
      to: h.to,
      classification: db?.classification ?? null,
      centipawnLoss: db?.centipawn_loss ?? null,
    };
  });
}

// ── Eval bar ──────────────────────────────────────────────────────────────────
// Shows a simple vertical fill: top = opponent advantage, bottom = player advantage
function EvalBar({ moves, idx, playedAs }: { moves: MoveInfo[]; idx: number; playedAs: "white" | "black" }) {
  const blundersBefore = moves.slice(0, idx + 1).filter(m => m.classification === "blunder").length;
  const mistakesBefore = moves.slice(0, idx + 1).filter(m => m.classification === "mistake").length;
  // Rough heuristic: each blunder = -10%, each mistake = -5%
  const penalty = blundersBefore * 10 + mistakesBefore * 5;
  // Player fill %: starts at 50, loses with blunders
  const fillPct = Math.max(10, Math.min(90, 50 - penalty));

  return (
    <div className="w-7 shrink-0 self-stretch rounded-xl overflow-hidden flex flex-col relative border"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="absolute top-2 left-0 right-0 flex justify-center">
        <span className="text-[8px] font-bold tracking-widest text-muted-foreground" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
          GANANDO
        </span>
      </div>
      {/* Opponent area (top) */}
      <div className="flex-1" style={{ background: "var(--border)" }} />
      {/* Player fill (bottom) */}
      <div style={{ height: `${fillPct}%`, background: "var(--bv-purple)", transition: "height 0.6s ease" }} />
      <div className="absolute bottom-2 left-0 right-0 flex justify-center">
        <span className="text-[8px] font-bold tracking-widest text-muted-foreground" style={{ writingMode: "vertical-lr" }}>
          PERDIENDO
        </span>
      </div>
    </div>
  );
}

// ── Move History Table ────────────────────────────────────────────────────────

function MoveTable({ moves, idx, onGo }: { moves: MoveInfo[]; idx: number; onGo: (n: number) => void }) {
  // Group moves into pairs: [white, black]
  const pairs: Array<{ n: number; white: MoveInfo | null; black: MoveInfo | null }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: moves[i].moveNumber, white: moves[i] ?? null, black: moves[i + 1] ?? null });
  }

  function MoveCell({ m, flatIdx }: { m: MoveInfo | null; flatIdx: number }) {
    if (!m) return <div className="col-span-3 text-muted-foreground opacity-40">…</div>;
    const isActive = flatIdx === idx;
    const col = m.classification ? CLASS_COLOR[m.classification] : undefined;
    const emoji = m.classification ? CLASS_EMOJI[m.classification] ?? "" : "";
    return (
      <div
        className="col-span-3 flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 transition-colors"
        style={{
          background: isActive ? "oklch(0.61 0.22 285 / 0.25)" : m.classification === "blunder" ? "oklch(0.63 0.23 25 / 0.08)" : "transparent",
          borderLeft: isActive ? "2px solid var(--bv-purple)" : m.classification === "blunder" ? "2px solid var(--bv-red)" : "2px solid transparent",
          color: col ?? "var(--foreground)",
          fontWeight: m.classification ? 700 : 400,
        }}
        onClick={() => onGo(flatIdx)}
      >
        <span className="font-mono text-xs">{emoji && <span>{emoji} </span>}{m.san}</span>
        {m.classification && (
          <span className="text-[9px] px-1 rounded font-bold ml-auto shrink-0"
            style={{ background: `${col}22`, color: col }}>
            {CLASS_LABEL[m.classification]}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border flex flex-col"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="grid grid-cols-7 px-4 py-2 border-b text-[10px] font-bold tracking-widest uppercase text-muted-foreground"
        style={{ borderColor: "var(--border)" }}>
        <div className="col-span-1">#</div>
        <div className="col-span-3">BLANCAS</div>
        <div className="col-span-3">NEGRAS</div>
      </div>
      {/* Rows */}
      <div className="overflow-y-auto max-h-60 divide-y divide-border">
        {pairs.map(({ n, white, black }) => {
          const wi = white ? moves.indexOf(white) : -1;
          const bi = black ? moves.indexOf(black) : -1;
          return (
            <div key={n} className="grid grid-cols-7 px-3 py-1.5 text-xs font-mono items-center"
              style={{ borderBottomColor: "oklch(0.20 0.03 265)" }}>
              <div className="col-span-1 text-muted-foreground text-[11px]">{n}</div>
              <MoveCell m={white} flatIdx={wi} />
              <MoveCell m={black} flatIdx={bi} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Master Insight card ───────────────────────────────────────────────────────

function InsightCard({ move }: { move: MoveInfo | null }) {
  if (!move?.classification || !["blunder", "mistake"].includes(move.classification)) return null;
  const col = CLASS_COLOR[move.classification] ?? "var(--bv-orange)";
  const isBlunder = move.classification === "blunder";
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3 border-l-4"
      style={{
        background: "oklch(0.165 0.025 265 / 0.6)",
        backdropFilter: "blur(20px)",
        borderColor: col,
        border: `1px solid var(--border)`,
        borderLeftColor: col,
        borderLeftWidth: 4,
      }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
        style={{ background: `${col}20` }}>
        {isBlunder ? "⚠️" : "⚡"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: col }}>
          {isBlunder ? "Error Grave" : "Punto de Quiebre"}
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          Jugaste <span className="font-bold font-mono" style={{ color: col }}>{move.san}</span>.{" "}
          {isBlunder
            ? "Este fue el error más crítico. Considera las amenazas del rival antes de cada jugada."
            : "Esta jugada cedió ventaja innecesariamente en esta posición."}
          {move.centipawnLoss && move.centipawnLoss > 0 && (
            <span className="text-muted-foreground"> ({move.centipawnLoss} centipeones perdidos)</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  pgn: string;
  playedAs: "white" | "black";
  dbMoves: DbMove[];
  jumpToBlunder?: boolean;
  gameResult?: Game["result"];
  opening?: string;
  accuracy?: number | null;
}

export function GameViewer({ pgn, playedAs, dbMoves, jumpToBlunder, gameResult, opening, accuracy }: Props) {
  const moves = useMemo(() => buildMoves(pgn, dbMoves), [pgn, dbMoves]);

  const firstBlunderIdx = jumpToBlunder
    ? moves.findIndex((m) => m.classification === "blunder")
    : -1;

  const [idx, setIdx] = useState(firstBlunderIdx >= 0 ? firstBlunderIdx : moves.length - 1);
  const [playing, setPlaying] = useState(false);

  const startFen = new Chess().fen();
  const currentFen  = idx >= 0 ? moves[idx].fen  : startFen;
  const currentMove = idx >= 0 ? moves[idx]       : null;
  const lastMove    = currentMove ? { from: currentMove.from, to: currentMove.to } : null;

  const go = useCallback((n: number) => {
    setIdx(Math.max(-1, Math.min(moves.length - 1, n)));
  }, [moves.length]);

  const blunderCount = useMemo(() => moves.filter(m => m.classification === "blunder").length, [moves]);
  const mistakeCount = useMemo(() => moves.filter(m => m.classification === "mistake").length, [moves]);

  if (moves.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-sm text-muted-foreground">No se pudo cargar el PGN de esta partida.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">

      {/* Opening title */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{opening}</p>
          {gameResult && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
              style={{
                background: gameResult === "win" ? "oklch(0.77 0.17 177 / 0.2)" : gameResult === "loss" ? "oklch(0.63 0.23 25 / 0.2)" : "oklch(0.70 0.18 50 / 0.2)",
                color: gameResult === "win" ? "var(--bv-green)" : gameResult === "loss" ? "var(--bv-red)" : "var(--bv-orange)",
              }}>
              {gameResult === "win" ? "Victoria" : gameResult === "loss" ? "Derrota" : "Tablas"}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground font-mono">
          {blunderCount > 0 && <span style={{ color: "var(--bv-red)" }}>??{blunderCount}</span>}
          {mistakeCount > 0 && <span style={{ color: "var(--bv-orange)" }}>?{mistakeCount}</span>}
        </div>
      </div>

      {/* Board row: eval bar + board */}
      <div className="flex gap-3 items-stretch">
        <div className="flex-1 min-w-0">
          <ChessBoard fen={currentFen} orientation={playedAs} lastMove={lastMove} />
        </div>
        <EvalBar moves={moves} idx={idx} playedAs={playedAs} />
      </div>

      {/* AI Insight card — only shows on blunder/mistake moves */}
      <InsightCard move={currentMove} />

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => go(idx - 1)} disabled={idx <= -1}
          className="flex-1 max-w-[130px] h-14 flex items-center justify-center gap-2 rounded-2xl border transition-all active:scale-95 disabled:opacity-30"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <ChevronLeft size={18} />
          <span className="text-sm font-semibold">Anterior</span>
        </button>

        <button
          onClick={() => { setPlaying(p => !p); go(playing ? idx : Math.min(idx + 1, moves.length - 1)); }}
          className="w-16 h-14 flex items-center justify-center rounded-2xl shadow-lg transition-all active:scale-90 hover:brightness-110"
          style={{ background: "var(--bv-purple)" }}>
          {playing ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white" fill="white" />}
        </button>

        <button
          onClick={() => go(idx + 1)} disabled={idx >= moves.length - 1}
          className="flex-1 max-w-[130px] h-14 flex items-center justify-center gap-2 rounded-2xl border transition-all active:scale-95 disabled:opacity-30"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <span className="text-sm font-semibold">Siguiente</span>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Move History Table */}
      <MoveTable moves={moves} idx={idx} onGo={go} />

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 border"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">PRECISIÓN</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold" style={{ color: "var(--bv-purple)" }}>
              {accuracy ? `${accuracy}%` : "—"}
            </span>
            <span className="text-sm text-muted-foreground mb-0.5">↗</span>
          </div>
        </div>
        <div className="rounded-xl p-4 border"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">ERRORES</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold" style={{ color: blunderCount > 0 ? "var(--bv-red)" : "var(--bv-green)" }}>
              {blunderCount + mistakeCount}
            </span>
            <span className="text-sm text-muted-foreground mb-0.5">
              {blunderCount > 0 ? "↘" : "↗"}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
