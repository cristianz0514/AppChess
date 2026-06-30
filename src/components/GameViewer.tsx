"use client";

import { useState, useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import type { Arrow } from "./ChessBoard";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart2, List, Brain, RotateCcw, Zap } from "lucide-react";
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
  evaluation: number | null;   // in pawns, white's perspective; ±9999 = mate
}

type Tab = "analizar" | "jugadas" | "consejos";

// ── Practice mode evaluator ───────────────────────────────────────────────────

interface PracticeResult {
  verdict: "excellent" | "good" | "neutral" | "illegal";
  message: string;
}

function evaluatePracticeMove(fenBefore: string, from: string, to: string): PracticeResult {
  const game = new Chess(fenBefore);
  let move;
  try {
    move = game.move({ from, to, promotion: "q" });
  } catch {
    return { verdict: "illegal", message: "Movimiento ilegal en esta posición." };
  }
  if (!move) return { verdict: "illegal", message: "Movimiento ilegal en esta posición." };

  if (game.isCheckmate()) return { verdict: "excellent", message: "¡Jaque mate! La jugada perfecta." };
  if (game.isCheck() && move.captured) return { verdict: "excellent", message: "¡Capturaste material y das jaque! Excelente combinación." };
  if (move.captured) {
    const vals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const gain = vals[move.captured] ?? 1;
    return gain >= 3
      ? { verdict: "excellent", message: `¡Excelente! Ganaste material (${move.captured === "n" || move.captured === "b" ? "pieza menor" : move.captured === "r" ? "torre" : "dama"}).` }
      : { verdict: "good", message: "Capturaste un peón. Puede ser una mejora." };
  }
  if (game.isCheck()) return { verdict: "good", message: "Das jaque — presionas al rival. Buena idea." };

  // Check if it's a developing move (knight or bishop to active square)
  const developingPieces = ["n", "b"];
  if (developingPieces.includes(move.piece)) return { verdict: "good", message: "Desarrollas una pieza — generalmente mejor que el error cometido." };

  return { verdict: "neutral", message: "Jugada legal. No pierde material, pero tampoco es la óptima. Intenta buscar capturas o amenazas." };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_COLOR: Record<string, string> = {
  blunder:    "var(--bv-red)",
  mistake:    "var(--bv-orange)",
  inaccuracy: "#ffd700",
  best:       "var(--bv-green)",
  excellent:  "var(--bv-green)",
  good:       "var(--bv-green)",
};

const CLASS_EMOJI: Record<string, string> = {
  blunder: "💥", mistake: "⚠️", inaccuracy: "❓", best: "⭐", excellent: "✨", good: "✓",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMoves(pgn: string, dbMoves: DbMove[]): MoveInfo[] {
  const master = new Chess();
  try { master.loadPgn(pgn); } catch { return []; }
  const history = master.history({ verbose: true });

  // dbMoves is ordered by move_number ASC from the DB query.
  // move_number in the DB is the chess notation number (1 for both white's and black's
  // first moves), so using it as a map key loses one of the two plies.
  // Instead, match by array position: dbMoves[i] corresponds to ply i.
  const game = new Chess();
  return history.map((h, i) => {
    game.move(h.san);
    const db = dbMoves[i];
    return {
      san: h.san,
      fen: game.fen(),
      moveNumber: Math.floor(i / 2) + 1,
      color: h.color as "w" | "b",
      from: h.from,
      to: h.to,
      classification: db?.classification ?? null,
      centipawnLoss: db?.centipawn_loss ?? null,
      evaluation: db?.evaluation ?? null,
    };
  });
}

// ── Eval bar ──────────────────────────────────────────────────────────────────

function evalToWhitePct(ev: number | null): number {
  if (ev === null) return 50;
  if (ev >= 90)  return 97;   // mate for white
  if (ev <= -90) return 3;    // mate for black
  // Sigmoid scaled: ±4 pawns ≈ ±40%, clamped 5–95
  return Math.min(95, Math.max(5, 50 + ev * 10));
}

function evalLabel(ev: number | null, whiteWinning: boolean): string {
  if (ev === null) return "";
  const abs = Math.abs(ev);
  if (abs >= 90)   return whiteWinning ? "Mate blancas" : "Mate negras";
  if (abs < 0.2)   return "Iguales";
  if (abs < 0.8)   return (whiteWinning ? "Blancas" : "Negras") + " mejor";
  if (abs < 2.0)   return (whiteWinning ? "Blancas" : "Negras") + " ganan";
  if (abs < 4.5)   return "Ventaja decisiva";
  return "Posición aplastante";
}

function evalScore(ev: number | null): string {
  if (ev === null) return "=";
  if (Math.abs(ev) >= 90) return "M#";
  const sign = ev > 0 ? "+" : ev < 0 ? "−" : "";
  return sign + Math.abs(ev).toFixed(1);
}

function EvalBar({ moves, idx }: { moves: MoveInfo[]; idx: number }) {
  const currentEval = idx >= 0 ? moves[idx].evaluation : null;
  const hasRealData = currentEval !== null;

  // Only use engine eval when real Stockfish data exists
  const ev = currentEval ?? 0;
  const whitePct = hasRealData ? evalToWhitePct(ev) : 50;
  const whiteWinning = ev >= 0;
  const isMate = hasRealData && Math.abs(ev) >= 90;
  const label = hasRealData ? evalLabel(ev, whiteWinning) : "Sin análisis";

  return (
    <div className="flex flex-col items-center gap-1 self-stretch" style={{ width: 28 }}>
      {/* Score chip — only shown when real data exists */}
      {hasRealData && (
        <div
          className="text-[9px] font-bold font-mono px-1 py-0.5 rounded leading-none shrink-0"
          style={{
            background: whiteWinning ? "#f0f4ff" : "#0d1117",
            color: whiteWinning ? "#0d1117" : "#f0f4ff",
            boxShadow: isMate ? `0 0 8px ${whiteWinning ? "rgba(0,212,161,0.6)" : "rgba(255,87,87,0.6)"}` : "none",
          }}
        >
          {evalScore(ev)}
        </div>
      )}

      {/* Bar */}
      <div
        className="flex-1 w-full rounded-lg overflow-hidden flex flex-col relative border"
        style={{ borderColor: "var(--border)" }}
      >
        {/* Black section (top) */}
        <div
          style={{
            flex: `${100 - whitePct} 0 0`,
            background: hasRealData ? "#0d1117" : "var(--muted)",
            transition: "flex 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* Divider line */}
        <div style={{ height: 2, background: "var(--border)", flexShrink: 0 }} />

        {/* White section (bottom) */}
        <div
          style={{
            flex: `${whitePct} 0 0`,
            background: !hasRealData
              ? "var(--muted)"
              : isMate
                ? (whiteWinning ? "var(--bv-green)" : "var(--bv-red)")
                : "#e8edf5",
            transition: "flex 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: isMate ? `inset 0 0 12px ${whiteWinning ? "rgba(0,212,161,0.4)" : "rgba(255,87,87,0.4)"}` : "none",
          }}
        />

        {/* Advantage band — only when real data and clearly winning */}
        {hasRealData && Math.abs(ev) > 1.5 && !isMate && (
          <div
            style={{
              position: "absolute",
              bottom: whiteWinning ? 0 : "auto",
              top: whiteWinning ? "auto" : 0,
              left: 0, right: 0,
              height: `${Math.min(30, Math.abs(ev) * 3)}%`,
              background: whiteWinning
                ? "linear-gradient(to top, rgba(0,212,161,0.35), transparent)"
                : "linear-gradient(to bottom, rgba(155,109,255,0.35), transparent)",
              transition: "height 0.55s ease",
            }}
          />
        )}
      </div>

      {/* Label */}
      <p
        className="text-[7px] font-semibold text-center leading-tight"
        style={{
          writingMode: "vertical-lr",
          transform: "rotate(180deg)",
          color: "var(--muted-foreground)",
          maxHeight: 60,
          overflow: "hidden",
          opacity: hasRealData ? 1 : 0.5,
        }}
      >
        {label}
      </p>
    </div>
  );
}

// ── Move History Table ────────────────────────────────────────────────────────

function MoveTable({ moves, idx, onGo, compact }: {
  moves: MoveInfo[];
  idx: number;
  onGo: (n: number) => void;
  compact?: boolean;
}) {
  const pairs: Array<{ n: number; white: MoveInfo | null; black: MoveInfo | null }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: moves[i].moveNumber, white: moves[i] ?? null, black: moves[i + 1] ?? null });
  }

  function MoveCell({ m, flatIdx }: { m: MoveInfo | null; flatIdx: number }) {
    if (!m) return <div className="flex-1" />;
    const isActive = flatIdx === idx;
    const col = m.classification ? CLASS_COLOR[m.classification] : undefined;
    const isError = m.classification === "blunder" || m.classification === "mistake";
    return (
      <div
        className="flex-1 flex items-center gap-1 cursor-pointer rounded px-1.5 py-1 transition-colors text-xs font-mono"
        style={{
          background: isActive ? "oklch(0.61 0.22 285 / 0.22)" : isError ? `${col}11` : "transparent",
          borderLeft: isActive ? `2px solid var(--bv-purple)` : isError ? `2px solid ${col}` : "2px solid transparent",
          color: col ?? "var(--foreground)",
          fontWeight: isActive || m.classification ? 600 : 400,
        }}
        onClick={() => onGo(flatIdx)}
      >
        <span>{m.san}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="grid grid-cols-7 px-3 py-2 border-b text-[10px] font-bold tracking-widest uppercase text-muted-foreground"
        style={{ borderColor: "var(--border)" }}>
        <div className="col-span-1">#</div>
        <div className="col-span-3">Blancas</div>
        <div className="col-span-3">Negras</div>
      </div>
      <div className={`overflow-y-auto divide-y divide-border ${compact ? "max-h-48" : "max-h-[60vh]"}`}>
        {pairs.map(({ n, white, black }) => {
          const wi = white ? moves.indexOf(white) : -1;
          const bi = black ? moves.indexOf(black) : -1;
          return (
            <div key={n} className="grid grid-cols-7 px-2 py-0.5 items-center text-xs">
              <div className="col-span-1 text-[10px] text-muted-foreground font-mono pl-1">{n}</div>
              <div className="col-span-3"><MoveCell m={white} flatIdx={wi} /></div>
              <div className="col-span-3"><MoveCell m={black} flatIdx={bi} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ move, onShowBestMove, loadingBestMove }: {
  move: MoveInfo | null;
  onShowBestMove?: () => void;
  loadingBestMove?: boolean;
}) {
  if (!move?.classification || !["blunder", "mistake"].includes(move.classification)) return null;
  const col = CLASS_COLOR[move.classification] ?? "var(--bv-orange)";
  const isBlunder = move.classification === "blunder";
  return (
    <div className="rounded-2xl border-l-4 overflow-hidden"
      style={{ background: "var(--card)", border: `1px solid var(--border)`, borderLeftColor: col, borderLeftWidth: 4 }}>
      <div className="p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
          style={{ background: `${col}20` }}>
          {isBlunder ? "⚠️" : "⚡"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: col }}>
            {isBlunder ? "Error Grave" : "Error"}
          </p>
          <p className="text-sm leading-snug">
            Jugaste <span className="font-bold font-mono" style={{ color: col }}>{move.san}</span>.{" "}
            {isBlunder
              ? "Error crítico — revisa las amenazas del rival antes de mover."
              : "Esta jugada cedió ventaja innecesariamente."}
            {move.centipawnLoss != null && move.centipawnLoss > 0 && (
              <span className="text-muted-foreground text-xs"> (−{move.centipawnLoss} cp)</span>
            )}
          </p>
        </div>
      </div>
      {onShowBestMove && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onShowBestMove}
            disabled={loadingBestMove}
            className="w-full py-2 text-xs font-bold transition-colors disabled:opacity-50"
            style={{ color: "var(--bv-green)" }}
          >
            {loadingBestMove ? "Calculando…" : "✨ Ver mejor jugada"}
          </button>
        </div>
      )}
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
  const [tab, setTab] = useState<Tab>("analizar");

  // Practice mode state
  const [practiceBlunderIdx, setPracticeBlunderIdx] = useState<number | null>(null);
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [practiceMovePlayed, setPracticeMovePlayed] = useState<{ from: string; to: string } | null>(null);
  const inPractice = practiceBlunderIdx !== null;

  const firstBlunderIdx = jumpToBlunder
    ? moves.findIndex((m) => m.classification === "blunder")
    : -1;

  const [idx, setIdx] = useState(firstBlunderIdx >= 0 ? firstBlunderIdx : moves.length - 1);

  const startFen    = new Chess().fen();
  const currentFen  = idx >= 0 ? moves[idx].fen  : startFen;
  const currentMove = idx >= 0 ? moves[idx]       : null;
  const lastMove    = currentMove ? { from: currentMove.from, to: currentMove.to } : null;

  // Practice mode: show position BEFORE the blunder
  const practiceMove = practiceBlunderIdx !== null ? moves[practiceBlunderIdx] : null;
  const practiceFen  = practiceBlunderIdx !== null
    ? (practiceBlunderIdx > 0 ? moves[practiceBlunderIdx - 1].fen : new Chess().fen())
    : null;

  // Arrow showing the blunder that was played
  const practiceArrows: Arrow[] = practiceMove
    ? [{ from: practiceMove.from, to: practiceMove.to, color: "red" }]
    : [];

  // Arrow showing user's practice move
  const userArrows: Arrow[] = practiceMovePlayed
    ? [{ from: practiceMovePlayed.from, to: practiceMovePlayed.to, color: "green" }]
    : [];

  function startPractice(blunderIdx: number) {
    setPracticeBlunderIdx(blunderIdx);
    setPracticeResult(null);
    setPracticeMovePlayed(null);
    setTab("consejos");
  }

  function exitPractice() {
    setPracticeBlunderIdx(null);
    setPracticeResult(null);
    setPracticeMovePlayed(null);
  }

  function handlePracticeMove(from: string, to: string) {
    if (!practiceFen || practiceResult) return;
    const result = evaluatePracticeMove(practiceFen, from, to);
    setPracticeResult(result);
    if (result.verdict !== "illegal") {
      setPracticeMovePlayed({ from, to });
    }
  }

  // Best move arrow state
  const [bestMoveArrow, setBestMoveArrow] = useState<Arrow | null>(null);
  const [loadingBestMove, setLoadingBestMove] = useState(false);

  // Exploration mode state (free interactive moves from any position)
  const [exploreFens, setExploreFens] = useState<string[]>([]);
  const [exploreMoves, setExploreMoves] = useState<Array<{ from: string; to: string }>>([]);
  const [exploreIdx, setExploreIdx] = useState(0);
  const inExplore = exploreFens.length > 0;
  const currentExploreFen = inExplore ? exploreFens[exploreIdx] : null;
  const exploreLastMove = inExplore && exploreIdx > 0 ? exploreMoves[exploreIdx - 1] : null;

  function enterExplore() {
    setBestMoveArrow(null);
    setExploreFens([currentFen]);
    setExploreMoves([]);
    setExploreIdx(0);
  }

  function exitExplore() {
    setExploreFens([]);
    setExploreMoves([]);
    setExploreIdx(0);
  }

  function handleExploreMove(from: string, to: string) {
    const fen = exploreFens[exploreIdx];
    const chess = new Chess(fen);
    try {
      const m = chess.move({ from, to, promotion: "q" });
      if (!m) return;
    } catch { return; }
    const newFen = chess.fen();
    const slicedFens = exploreFens.slice(0, exploreIdx + 1);
    const slicedMoves = exploreMoves.slice(0, exploreIdx);
    setExploreFens([...slicedFens, newFen]);
    setExploreMoves([...slicedMoves, { from, to }]);
    setExploreIdx(exploreIdx + 1);
  }

  async function fetchBestMove(blunderIdx: number) {
    const beforeFen = blunderIdx > 0 ? moves[blunderIdx - 1].fen : new Chess().fen();
    setLoadingBestMove(true);
    setBestMoveArrow(null);
    // Navigate to position before the blunder so the arrow makes sense visually
    setIdx(Math.max(-1, blunderIdx - 1));
    try {
      const r = await fetch(`/api/bestmove?fen=${encodeURIComponent(beforeFen)}`);
      if (r.ok) {
        const data = await r.json();
        if (data.from && data.to) setBestMoveArrow({ from: data.from, to: data.to, color: "green" });
      }
    } catch {}
    setLoadingBestMove(false);
  }

  const go = useCallback((n: number) => {
    setBestMoveArrow(null);
    setIdx(Math.max(-1, Math.min(moves.length - 1, n)));
  }, [moves.length]);

  const blunderCount = useMemo(() => moves.filter(m => m.classification === "blunder").length, [moves]);
  const mistakeCount = useMemo(() => moves.filter(m => m.classification === "mistake").length, [moves]);

  // ── Critical moment: YOUR move that swung the game most against you ──────────
  // Uses the move with the largest centipawn loss among the player's own moves.
  const playerColor = playedAs === "white" ? "w" : "b";
  const criticalMoment = useMemo(() => {
    let best: { idx: number; loss: number } | null = null;
    moves.forEach((m, i) => {
      if (m.color !== playerColor) return;
      const loss = m.centipawnLoss ?? 0;
      if (loss >= 150 && (!best || loss > best.loss)) best = { idx: i, loss };
    });
    if (!best) return null;
    const i = (best as { idx: number; loss: number }).idx;
    const toMine = (e: number | null) =>
      e === null ? null : (playerColor === "w" ? e : -e);
    const evalBefore = toMine(i > 0 ? moves[i - 1].evaluation : 0);
    const evalAfter = toMine(moves[i].evaluation);
    return { idx: i, move: moves[i], evalBefore, evalAfter };
  }, [moves, playerColor]);

  const fmtEval = (e: number | null) =>
    e === null ? "—" : Math.abs(e) >= 9999 ? (e > 0 ? "#" : "-#") : (e > 0 ? "+" : "") + e.toFixed(1);

  if (moves.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-sm text-muted-foreground">No se pudo cargar el PGN de esta partida.</p>
      </div>
    );
  }

  const TABS = [
    { id: "analizar" as Tab, label: "Analizar",  Icon: BarChart2 },
    { id: "jugadas"  as Tab, label: "Jugadas",   Icon: List      },
    { id: "consejos" as Tab, label: "Consejos",  Icon: Brain     },
  ];

  return (
    <div className="flex flex-col gap-3 pt-2 pb-2">

      {/* ── Header info ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{opening}</p>
          {gameResult && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block"
              style={{
                background: gameResult === "win" ? "oklch(0.77 0.17 177 / 0.2)" : gameResult === "loss" ? "oklch(0.63 0.23 25 / 0.2)" : "oklch(0.70 0.18 50 / 0.2)",
                color: gameResult === "win" ? "var(--bv-green)" : gameResult === "loss" ? "var(--bv-red)" : "var(--bv-orange)",
              }}>
              {gameResult === "win" ? "Victoria" : gameResult === "loss" ? "Derrota" : "Tablas"}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs font-semibold shrink-0">
          {blunderCount > 0 && <span style={{ color: "var(--bv-red)" }}>💥 {blunderCount}</span>}
          {mistakeCount > 0 && <span style={{ color: "var(--bv-orange)" }}>⚠️ {mistakeCount}</span>}
        </div>
      </div>

      {/* ── Tab: Analizar ────────────────────────────────────── */}
      {tab === "analizar" && (
        <>
          {/* Critical moment — the move that changed the game */}
          {!inExplore && criticalMoment && (
            <button
              onClick={() => go(criticalMoment.idx)}
              className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99]"
              style={{
                borderColor: idx === criticalMoment.idx ? "var(--bv-purple)" : "var(--border)",
                background: "oklch(0.61 0.22 285 / 0.07)",
              }}>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={15} style={{ color: "var(--bv-purple)" }} />
                <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                  Momento Crítico
                </span>
              </div>
              <p className="text-sm font-semibold leading-snug">
                La partida cambió en la jugada {criticalMoment.move.moveNumber}
                {criticalMoment.move.color === "w" ? "." : "…"} {criticalMoment.move.san}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-md tabular-nums"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  {fmtEval(criticalMoment.evalBefore)}
                </span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md tabular-nums font-bold"
                  style={{ background: "oklch(0.63 0.23 25 / 0.12)", color: "var(--bv-red)" }}>
                  {fmtEval(criticalMoment.evalAfter)}
                </span>
                <span className="text-[11px] text-muted-foreground ml-auto">Ver en el tablero →</span>
              </div>
            </button>
          )}

          {/* Board + eval bar */}
          <div className="flex gap-2 items-stretch">
            <EvalBar moves={moves} idx={inExplore ? -1 : idx} />
            <div className="flex-1 min-w-0 relative">
              {/* Explore mode banner */}
              {inExplore && (
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 rounded-t-xl text-xs font-bold"
                  style={{ background: "oklch(0.61 0.22 285 / 0.92)", color: "#fff" }}>
                  <span>🔍 Exploración libre</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExploreIdx(Math.max(0, exploreIdx - 1))}
                      disabled={exploreIdx === 0}
                      className="px-2 py-0.5 rounded-lg text-white font-bold disabled:opacity-40 hover:bg-white/20 transition-colors">
                      ←
                    </button>
                    <button
                      onClick={() => setExploreIdx(Math.min(exploreFens.length - 1, exploreIdx + 1))}
                      disabled={exploreIdx >= exploreFens.length - 1}
                      className="px-2 py-0.5 rounded-lg text-white font-bold disabled:opacity-40 hover:bg-white/20 transition-colors">
                      →
                    </button>
                    <button onClick={exitExplore}
                      className="ml-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                      Salir
                    </button>
                  </div>
                </div>
              )}
              <ChessBoard
                fen={inExplore ? currentExploreFen! : currentFen}
                orientation={playedAs}
                lastMove={inExplore ? exploreLastMove : lastMove}
                arrows={!inExplore && bestMoveArrow ? [bestMoveArrow] : []}
                interactive={inExplore}
                onMove={inExplore ? handleExploreMove : undefined}
                lastMoveBadge={!inExplore && currentMove?.classification && CLASS_EMOJI[currentMove.classification]
                  ? { emoji: CLASS_EMOJI[currentMove.classification], color: CLASS_COLOR[currentMove.classification] ?? "var(--bv-purple)" }
                  : null}
              />
            </div>
          </div>

          {/* Explore button */}
          {!inExplore && (
            <button
              onClick={enterExplore}
              className="w-full py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-muted/40"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }}>
              🔍 Explorar desde aquí
            </button>
          )}

          {/* Insight on current move (only when not exploring) */}
          {!inExplore && (
            <InsightCard
              move={currentMove}
              onShowBestMove={currentMove && ["blunder", "mistake"].includes(currentMove.classification ?? "") ? () => fetchBestMove(idx) : undefined}
              loadingBestMove={loadingBestMove}
            />
          )}

          {/* Controls (game navigation, hidden in explore mode) */}
          {!inExplore && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => go(-1)} disabled={idx <= -1}
              className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
              title="Inicio">
              <ChevronsLeft size={18} />
            </button>
            <button
              onClick={() => go(idx - 1)} disabled={idx <= -1}
              className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl border transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <ChevronLeft size={16} />
              <span className="text-sm font-semibold">Anterior</span>
            </button>
            <button
              onClick={() => go(idx + 1)} disabled={idx >= moves.length - 1}
              className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl border transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <span className="text-sm font-semibold">Siguiente</span>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => go(moves.length - 1)} disabled={idx >= moves.length - 1}
              className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
              title="Final">
              <ChevronsRight size={18} />
            </button>
          </div>
          )}

          {/* Move indicator */}
          <p className="text-center text-[11px] text-muted-foreground">
            {inExplore
              ? `Exploración — jugada ${exploreIdx} desde jug. ${idx < 0 ? "inicial" : `${moves[idx].moveNumber}`}`
              : idx < 0 ? "Posición inicial" : `Jugada ${moves[idx].moveNumber} · ${moves[idx].color === "w" ? "Blancas" : "Negras"}`}
            {!inExplore && ` · ${idx + 2}/${moves.length + 1}`}
          </p>

          {/* Compact move list */}
          <MoveTable moves={moves} idx={idx} onGo={go} compact />

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3 border text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">PRECISIÓN</p>
              <p className="text-2xl font-bold" style={{ color: "var(--bv-purple)" }}>
                {accuracy ? `${accuracy}%` : "—"}
              </p>
            </div>
            <div className="rounded-xl p-3 border text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">ERRORES</p>
              <p className="text-2xl font-bold" style={{ color: blunderCount > 0 ? "var(--bv-red)" : "var(--bv-green)" }}>
                {blunderCount + mistakeCount}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Tab: Jugadas ─────────────────────────────────────── */}
      {tab === "jugadas" && (
        <div className="space-y-3">
          {/* Mini board for reference */}
          <div className="flex gap-2 items-stretch">
            <EvalBar moves={moves} idx={idx} />
            <div className="flex-1 min-w-0">
              <ChessBoard fen={currentFen} orientation={playedAs} lastMove={lastMove} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} disabled={idx <= -1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <ChevronsLeft size={15} />
            </button>
            <button onClick={() => go(idx - 1)} disabled={idx <= -1}
              className="flex-1 h-9 flex items-center justify-center gap-1 rounded-xl border disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <ChevronLeft size={15} /><span className="text-xs font-semibold">Anterior</span>
            </button>
            <button onClick={() => go(idx + 1)} disabled={idx >= moves.length - 1}
              className="flex-1 h-9 flex items-center justify-center gap-1 rounded-xl border disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <span className="text-xs font-semibold">Siguiente</span><ChevronRight size={15} />
            </button>
            <button onClick={() => go(moves.length - 1)} disabled={idx >= moves.length - 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border disabled:opacity-30"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <ChevronsRight size={15} />
            </button>
          </div>
          {/* Full move list */}
          <MoveTable moves={moves} idx={idx} onGo={go} />
        </div>
      )}

      {/* ── Tab: Consejos / Práctica ─────────────────────────── */}
      {tab === "consejos" && !inPractice && (
        <div className="space-y-3">
          {moves.filter(m => m.classification === "blunder" || m.classification === "mistake").length === 0 ? (
            <div className="rounded-2xl p-8 text-center border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <p className="text-3xl mb-2">🎯</p>
              <p className="text-sm font-semibold">¡Partida limpia!</p>
              <p className="text-xs text-muted-foreground mt-1">No se detectaron errores graves en esta partida.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">
                Toca <span className="font-semibold text-foreground">Practicar</span> en cualquier error para intentar la posición tú mismo.
              </p>
              {moves
                .map((m, i) => ({ ...m, flatIdx: i }))
                .filter(m => m.classification === "blunder" || m.classification === "mistake")
                .map((m, i) => {
                  const col = CLASS_COLOR[m.classification!];
                  const isBlunder = m.classification === "blunder";
                  return (
                    <div key={i} className="rounded-2xl border overflow-hidden"
                      style={{ background: "var(--card)", borderColor: "var(--border)", borderLeftColor: col, borderLeftWidth: 4 }}>
                      <div className="p-3 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                          style={{ background: `${col}20` }}>
                          {isBlunder ? "⚠️" : "⚡"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: col }}>
                              {isBlunder ? "Error Grave" : "Error"} · Jug. {m.moveNumber}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{m.color === "w" ? "Blancas" : "Negras"}</span>
                          </div>
                          <p className="text-sm">
                            Jugaste <span className="font-bold font-mono" style={{ color: col }}>{m.san}</span>
                            {m.centipawnLoss != null && m.centipawnLoss > 0 && (
                              <span className="text-muted-foreground text-xs ml-1">−{m.centipawnLoss} cp</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex border-t divide-x" style={{ borderColor: "var(--border)" }}>
                        <button onClick={() => { go(m.flatIdx); setTab("analizar"); }}
                          className="flex-1 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                          Ver en tablero
                        </button>
                        <button onClick={() => { fetchBestMove(m.flatIdx); setTab("analizar"); }}
                          disabled={loadingBestMove}
                          className="flex-1 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                          style={{ color: "var(--bv-green)" }}>
                          ✨ Mejor jugada
                        </button>
                        <button onClick={() => startPractice(m.flatIdx)}
                          className="flex-1 py-2 text-xs font-bold transition-colors"
                          style={{ color: "var(--bv-purple)" }}>
                          🎯 Practicar
                        </button>
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="rounded-xl p-3 border text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">PRECISIÓN</p>
              <p className="text-2xl font-bold" style={{ color: "var(--bv-purple)" }}>{accuracy ? `${accuracy}%` : "—"}</p>
            </div>
            <div className="rounded-xl p-3 border text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">ERRORES</p>
              <p className="text-2xl font-bold" style={{ color: blunderCount > 0 ? "var(--bv-red)" : "var(--bv-green)" }}>
                {blunderCount + mistakeCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Modo Práctica ────────────────────────────────────── */}
      {tab === "consejos" && inPractice && practiceFen && practiceMove && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                Modo Práctica
              </p>
              <p className="text-sm font-semibold">
                Jugada {practiceMove.moveNumber} · {practiceMove.color === "w" ? "Blancas" : "Negras"}
              </p>
            </div>
            <button onClick={exitPractice}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-colors hover:bg-muted/50"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              <RotateCcw size={12} /> Volver
            </button>
          </div>

          {/* Instruction */}
          {!practiceResult && (
            <div className="rounded-2xl p-3 border" style={{ background: "oklch(0.61 0.22 285 / 0.08)", borderColor: "oklch(0.61 0.22 285 / 0.3)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--bv-purple)" }}>¿Qué hubieras jugado?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                La flecha <span className="text-red-400 font-bold">roja</span> muestra el error cometido ({practiceMove.san}).
                Toca una pieza y luego el destino para intentar tu jugada.
              </p>
            </div>
          )}

          {/* Practice board */}
          <div className="flex gap-2 items-stretch">
            <EvalBar moves={moves} idx={Math.max(-1, practiceBlunderIdx! - 1)} />
            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={practiceResult && practiceMovePlayed
                  ? (() => {
                      const g = new Chess(practiceFen);
                      try { g.move({ from: practiceMovePlayed.from, to: practiceMovePlayed.to, promotion: "q" }); } catch {}
                      return g.fen();
                    })()
                  : practiceFen
                }
                orientation={playedAs}
                arrows={practiceResult ? userArrows : practiceArrows}
                interactive={!practiceResult}
                onMove={handlePracticeMove}
              />
            </div>
          </div>

          {/* Result feedback */}
          {practiceResult && (
            <div className="rounded-2xl p-4 border-l-4"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
                borderLeftColor: practiceResult.verdict === "excellent" ? "var(--bv-green)"
                  : practiceResult.verdict === "good" ? "var(--bv-green)"
                  : practiceResult.verdict === "neutral" ? "var(--bv-orange)"
                  : "var(--bv-red)",
                borderLeftWidth: 4,
              }}>
              <p className="text-lg font-bold mb-1">
                {practiceResult.verdict === "excellent" ? "✅ ¡Excelente!" :
                 practiceResult.verdict === "good"      ? "✅ ¡Buena jugada!" :
                 practiceResult.verdict === "neutral"   ? "⚠️ Jugada aceptable" :
                 "❌ Movimiento ilegal"}
              </p>
              <p className="text-sm text-muted-foreground">{practiceResult.message}</p>
              {practiceResult.verdict !== "illegal" && (
                <p className="text-xs text-muted-foreground mt-2">
                  El error original fue <span className="font-bold font-mono" style={{ color: "var(--bv-red)" }}>{practiceMove.san}</span>.
                  {practiceMove.centipawnLoss != null && practiceMove.centipawnLoss > 0 && ` Costó ${practiceMove.centipawnLoss} centipeones.`}
                </p>
              )}
            </div>
          )}

          {/* Try again / next blunder */}
          <div className="flex gap-2">
            {practiceResult && (
              <button onClick={() => { setPracticeResult(null); setPracticeMovePlayed(null); }}
                className="flex-1 py-2.5 rounded-2xl border text-xs font-semibold transition-all"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                Intentar de nuevo
              </button>
            )}
            {practiceResult && (() => {
              const errors = moves.map((m, i) => ({ ...m, flatIdx: i })).filter(m => m.classification === "blunder" || m.classification === "mistake");
              const nextErr = errors.find(e => e.flatIdx > practiceBlunderIdx!);
              return nextErr ? (
                <button onClick={() => startPractice(nextErr.flatIdx)}
                  className="flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all"
                  style={{ background: "var(--bv-purple)", color: "#fff" }}>
                  Siguiente error →
                </button>
              ) : (
                <button onClick={exitPractice}
                  className="flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all"
                  style={{ background: "var(--bv-green)", color: "#fff" }}>
                  ¡Completado! 🎉
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Bottom Tab Bar ───────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 px-4 pb-3 pt-2 mt-2 border-t backdrop-blur-xl"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex justify-around">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-all"
                style={{ color: isActive ? "var(--bv-purple)" : "var(--muted-foreground)" }}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
