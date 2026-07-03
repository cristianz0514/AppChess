"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import type { Arrow } from "./ChessBoard";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart2, List, Brain, RotateCcw, Zap, Star, Gauge, XCircle } from "lucide-react";
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

interface CriticalMoment {
  idx: number;
  move: MoveInfo;
  evalBefore: number | null;
  evalAfter: number | null;
}

// Story Mode is an emotional arc: intro ("you were winning") → each turning
// point → outro ("your eval never recovered"). All computed from eval data.
type StorySlide =
  | { type: "intro"; peak: number; boardIdx: number }
  | { type: "moment"; cm: CriticalMoment; boardIdx: number }
  | { type: "outro"; recovered: boolean; finalEval: number | null; lastMoveNumber: number; boardIdx: number };

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

// Simple monochrome glyphs (rendered white on a flat colored disc) — kept minimal
// so the board doesn't feel busy.
const CLASS_EMOJI: Record<string, string> = {
  blunder: "✕", mistake: "!", inaccuracy: "?", best: "✓", excellent: "✓", good: "✓",
};

// Coach-style narrative for a critical moment: a concise cause + a practical
// takeaway. Rule-based (no latency/cost) but written like a blitz coach.
function storyNarrative(
  move: MoveInfo,
  evalBefore: number | null,
  evalAfter: number | null,
): { cause: string; takeaway: string } {
  const before = evalBefore ?? 0;
  const after = evalAfter ?? 0;
  const phase = move.moveNumber <= 10 ? "apertura" : move.moveNumber <= 25 ? "medio juego" : "final";

  let cause: string;
  if (before >= 2 && after < 1) {
    cause = "Ibas ganando con claridad y esta jugada soltó casi toda la ventaja.";
  } else if (before > 0.5 && after < -0.5) {
    cause = "Aquí la partida se dio vuelta: pasaste de estar mejor a estar peor.";
  } else if (after <= -2) {
    cause = "Esta jugada te dejó en una posición claramente perdida.";
  } else {
    cause = "Cediste una parte importante de la evaluación con esta jugada.";
  }

  const takeaway =
    phase === "apertura"
      ? "En la apertura: desarrolla piezas y no muevas dos veces la misma sin razón."
      : phase === "medio juego"
        ? "Antes de atacar, revisa una vez más si dejas alguna pieza sin defensa."
        : "En el final cada peón pesa — tómate el tiempo de calcular antes de mover.";

  return { cause, takeaway };
}

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

// Horizontal eval bar — sits ABOVE the board so the board can use the full width.
// White advantage fills from the left; the score sits on the winning side.
function EvalBar({ moves, idx }: { moves: MoveInfo[]; idx: number }) {
  const currentEval = idx >= 0 ? moves[idx].evaluation : null;
  const hasRealData = currentEval !== null;

  const ev = currentEval ?? 0;
  const whitePct = hasRealData ? evalToWhitePct(ev) : 50;
  const whiteWinning = ev >= 0;
  const isMate = hasRealData && Math.abs(ev) >= 90;
  const label = hasRealData ? evalLabel(ev, whiteWinning) : "Sin análisis";

  return (
    <div className="w-full flex items-center gap-2">
      <div
        className="relative flex-1 h-6 rounded-lg overflow-hidden border"
        style={{
          borderColor: "var(--border)",
          background: hasRealData ? "#0d1117" : "var(--muted)",
        }}
      >
        {/* White fill from the left */}
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${whitePct}%`,
            background: !hasRealData
              ? "var(--muted)"
              : isMate
                ? (whiteWinning ? "var(--bv-green)" : "#e8edf5")
                : "#e8edf5",
            transition: "width 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        {/* Center tick */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border)", opacity: 0.6 }} />
        {/* Score on the winning side */}
        {hasRealData && (
          <span
            className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono tabular-nums"
            style={{
              [whiteWinning ? "left" : "right"]: 8,
              color: whiteWinning ? "#0d1117" : "#f0f4ff",
            } as React.CSSProperties}
          >
            {evalScore(ev)}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium shrink-0 w-20 text-right"
        style={{ color: "var(--muted-foreground)", opacity: hasRealData ? 1 : 0.5 }}>
        {label}
      </span>
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
  avgAccuracy?: number | null;
  gameId?: string;
  autoStory?: boolean;
}

export function GameViewer({ pgn, playedAs, dbMoves, jumpToBlunder, gameResult, opening, accuracy, avgAccuracy, gameId, autoStory }: Props) {
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

  // Swipe (mobile) + arrow keys (desktop) to replay moves like a reel.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    setIdx((cur) => Math.max(-1, Math.min(moves.length - 1, cur + (dx < 0 ? 1 : -1))));
    setBestMoveArrow(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { setBestMoveArrow(null); setIdx((c) => Math.max(-1, c - 1)); }
      else if (e.key === "ArrowRight") { setBestMoveArrow(null); setIdx((c) => Math.min(moves.length - 1, c + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

  const blunderCount = useMemo(() => moves.filter(m => m.classification === "blunder").length, [moves]);
  const mistakeCount = useMemo(() => moves.filter(m => m.classification === "mistake").length, [moves]);

  // ── Critical moments: YOUR moves that swung the game most against you ───────
  const playerColor = playedAs === "white" ? "w" : "b";
  const toMine = useCallback(
    (e: number | null) => (e === null ? null : playerColor === "w" ? e : -e),
    [playerColor],
  );

  const criticalMoments = useMemo(() => {
    const candidates: { idx: number; loss: number }[] = [];
    moves.forEach((m, i) => {
      if (m.color !== playerColor) return;
      const loss = m.centipawnLoss ?? 0;
      if (loss >= 150) candidates.push({ idx: i, loss });
    });
    // Take the 3 worst, then present them in chronological order.
    return candidates
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 3)
      .sort((a, b) => a.idx - b.idx)
      .map(({ idx: i }) => ({
        idx: i,
        move: moves[i],
        evalBefore: toMine(i > 0 ? moves[i - 1].evaluation : 0),
        evalAfter: toMine(moves[i].evaluation),
      }));
  }, [moves, playerColor, toMine]);

  const criticalMoment = criticalMoments.length > 0 ? criticalMoments[0] : null;

  // Engine's best move at the #1 critical moment — shown in the summary footer.
  const [footerBest, setFooterBest] = useState<string | null>(null);
  useEffect(() => {
    if (!criticalMoment) return;
    const fenBefore = criticalMoment.idx > 0 ? moves[criticalMoment.idx - 1].fen : new Chess().fen();
    let cancelled = false;
    fetch(`/api/bestmove?fen=${encodeURIComponent(fenBefore)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.from) return;
        try {
          const mv = new Chess(fenBefore).move({ from: d.from, to: d.to, promotion: "q" });
          if (mv) setFooterBest(mv.san);
        } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [criticalMoment, moves]);

  const fmtEval = (e: number | null) =>
    e === null ? "—" : Math.abs(e) >= 9999 ? (e > 0 ? "#" : "-#") : (e > 0 ? "+" : "") + e.toFixed(1);

  // ── Story Mode: guided EMOTIONAL arc through the game ───────────────────────
  const storySlides = useMemo<StorySlide[]>(() => {
    if (criticalMoments.length === 0) return [];
    const firstIdx = criticalMoments[0].idx;
    let peak = 0;
    for (let i = 0; i < firstIdx; i++) {
      const e = toMine(moves[i].evaluation);
      if (e != null && e > peak) peak = e;
    }
    const lastIdx = criticalMoments[criticalMoments.length - 1].idx;
    let recovered = false;
    for (let i = lastIdx + 1; i < moves.length; i++) {
      const e = toMine(moves[i].evaluation);
      if (e != null && e >= 0.5) { recovered = true; break; }
    }
    const finalEval = toMine(moves[moves.length - 1].evaluation);
    return [
      { type: "intro", peak, boardIdx: Math.max(-1, firstIdx - 1) },
      ...criticalMoments.map((cm) => ({ type: "moment" as const, cm, boardIdx: cm.idx })),
      {
        type: "outro",
        recovered,
        finalEval,
        lastMoveNumber: criticalMoments[criticalMoments.length - 1].move.moveNumber,
        boardIdx: moves.length - 1,
      },
    ];
  }, [criticalMoments, moves, toMine]);

  const [storyStep, setStoryStep] = useState<number | null>(null);
  const inStory = storyStep !== null;
  const currentSlide = inStory ? storySlides[storyStep!] : null;

  // Engine's best move per critical moment (Stockfish, objective) — SAN + green
  // arrow, grounding the "why" in real calculation. Cached by move index.
  const [storyBest, setStoryBest] = useState<Record<number, string | null>>({});
  const [bestLoading, setBestLoading] = useState(false);

  useEffect(() => {
    if (!currentSlide || currentSlide.type !== "moment") return;
    const cm = currentSlide.cm;
    const fenBefore = cm.idx > 0 ? moves[cm.idx - 1].fen : new Chess().fen();
    if (storyBest[cm.idx] !== undefined) {
      const cached = storyBest[cm.idx];
      if (cached) {
        try {
          const mv = new Chess(fenBefore).move(cached);
          if (mv) setBestMoveArrow({ from: mv.from, to: mv.to, color: "green" });
        } catch {}
      }
      return;
    }
    let cancelled = false;
    setBestLoading(true);
    setBestMoveArrow(null);
    fetch(`/api/bestmove?fen=${encodeURIComponent(fenBefore)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        let san: string | null = null;
        if (d?.from && d?.to) {
          try {
            const mv = new Chess(fenBefore).move({ from: d.from, to: d.to, promotion: "q" });
            if (mv) { san = mv.san; setBestMoveArrow({ from: d.from, to: d.to, color: "green" }); }
          } catch {}
        }
        setStoryBest((prev) => ({ ...prev, [cm.idx]: san }));
      })
      .catch(() => { if (!cancelled) setStoryBest((prev) => ({ ...prev, [cm.idx]: null })); })
      .finally(() => { if (!cancelled) setBestLoading(false); });
    return () => { cancelled = true; };
  }, [currentSlide, moves, storyBest]);

  function startStory() {
    if (storySlides.length === 0) return;
    setBestMoveArrow(null);
    setStoryStep(0);
    go(storySlides[0].boardIdx);
  }
  function exitStory() { setStoryStep(null); setBestMoveArrow(null); }

  // Auto-start Story Mode when arrived via "Revivir" (guided, cinematic entry).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStory && !autoStarted.current && storySlides.length > 0) {
      autoStarted.current = true;
      setBestMoveArrow(null);
      setStoryStep(0);
      go(storySlides[0].boardIdx);
    }
  }, [autoStory, storySlides, go]);

  function storyGo(step: number) {
    const clamped = Math.max(0, Math.min(storySlides.length - 1, step));
    setStoryStep(clamped);
    setBestMoveArrow(null);
    go(storySlides[clamped].boardIdx);
  }

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
          {/* Story Mode — guided emotional arc (intro → moments → outro) */}
          {!inExplore && inStory && currentSlide && (
            <div className="rounded-2xl border p-4 space-y-3"
              style={{ borderColor: "var(--bv-purple)", background: "oklch(0.61 0.22 285 / 0.07)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={15} style={{ color: "var(--bv-purple)" }} />
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                    {currentSlide.type === "intro"
                      ? "El comienzo"
                      : currentSlide.type === "outro"
                        ? "El desenlace"
                        : `Momento ${storyStep!} de ${criticalMoments.length}`}
                  </span>
                </div>
                <button onClick={exitStory} className="text-[11px] text-muted-foreground underline underline-offset-2">
                  Salir
                </button>
              </div>

              {/* INTRO */}
              {currentSlide.type === "intro" && (
                <>
                  <p className="text-lg font-bold leading-snug font-display">
                    {currentSlide.peak >= 2
                      ? "Ibas ganando cómodo."
                      : currentSlide.peak >= 0.7
                        ? "Tenías una ligera ventaja."
                        : "La partida estaba pareja."}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentSlide.peak >= 0.7
                      ? `Llegaste a estar +${currentSlide.peak.toFixed(1)}. Veamos cómo se te escapó.`
                      : "Hasta que llegaron los momentos que la decidieron. Vamos uno por uno."}
                  </p>
                </>
              )}

              {/* MOMENT */}
              {currentSlide.type === "moment" && (() => {
                const cm = currentSlide.cm;
                const dropped = (cm.evalBefore ?? 0) - (cm.evalAfter ?? 0);
                const { cause, takeaway } = storyNarrative(cm.move, cm.evalBefore, cm.evalAfter);
                return (
                  <>
                    <p className="text-base font-semibold leading-snug font-display">
                      Jugada {cm.move.moveNumber}{cm.move.color === "w" ? "." : "…"} {cm.move.san}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md tabular-nums"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                        {fmtEval(cm.evalBefore)}
                      </span>
                      <span className="text-muted-foreground text-xs">→</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md tabular-nums font-bold"
                        style={{ background: "oklch(0.63 0.23 25 / 0.12)", color: "var(--bv-red)" }}>
                        {fmtEval(cm.evalAfter)}
                      </span>
                      {dropped > 0 && Math.abs(cm.evalBefore ?? 0) < 90 && Math.abs(cm.evalAfter ?? 0) < 90 && (
                        <span className="text-[11px] font-semibold" style={{ color: "var(--bv-red)" }}>−{dropped.toFixed(1)}</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{cause}</p>
                    {storyBest[cm.idx] ? (
                      <p className="text-xs leading-relaxed">
                        <span className="font-semibold" style={{ color: "var(--bv-green)" }}>La mejor jugada era </span>
                        <span className="font-mono font-bold">{storyBest[cm.idx]}</span>
                        <span className="text-muted-foreground"> — mírala en la flecha verde del tablero.</span>
                      </p>
                    ) : bestLoading ? (
                      <p className="text-xs text-muted-foreground italic">Stockfish está calculando la mejor jugada…</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-semibold" style={{ color: "var(--bv-purple)" }}>Para la próxima: </span>
                      {takeaway}
                    </p>
                  </>
                );
              })()}

              {/* OUTRO */}
              {currentSlide.type === "outro" && (
                <>
                  <p className="text-lg font-bold leading-snug font-display">
                    {currentSlide.recovered
                      ? "Lograste recuperarte."
                      : "Tu evaluación nunca se recuperó."}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentSlide.recovered
                      ? `Después de la jugada ${currentSlide.lastMoveNumber} volviste a ponerte por delante. La lección: reconoce el momento de peligro antes de que sea tarde.`
                      : `Desde la jugada ${currentSlide.lastMoveNumber} no volviste a tomar la ventaja. Trabaja en no dejar que un error arrastre toda la partida.`}
                  </p>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => storyGo(storyStep! - 1)} disabled={storyStep === 0}
                  className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-30 hover:bg-muted/40"
                  style={{ borderColor: "var(--border)" }}>
                  ← Anterior
                </button>
                {storyStep! < storySlides.length - 1 ? (
                  <button onClick={() => storyGo(storyStep! + 1)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                    style={{ background: "var(--bv-purple)" }}>
                    Siguiente →
                  </button>
                ) : (
                  <button onClick={exitStory}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                    style={{ background: "var(--bv-purple)" }}>
                    Terminar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Critical moment summary card (when not in story) */}
          {!inExplore && !inStory && criticalMoment && (
            <div className="rounded-2xl border p-4"
              style={{
                borderColor: idx === criticalMoment.idx ? "var(--bv-purple)" : "var(--border)",
                background: "oklch(0.61 0.22 285 / 0.07)",
              }}>
              <button onClick={() => go(criticalMoment.idx)} className="w-full text-left active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={15} style={{ color: "var(--bv-purple)" }} />
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                    Momento Crítico
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-2xl font-display font-bold leading-[1.1]">
                    Esta jugada <span style={{ color: "var(--bv-purple)" }}>cambió</span> la partida.
                  </p>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono leading-tight">
                      {criticalMoment.move.moveNumber}{criticalMoment.move.color === "w" ? "." : "…"} {criticalMoment.move.san}
                    </p>
                    <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground mt-1">Swing</p>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded tabular-nums"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                        {fmtEval(criticalMoment.evalBefore)}
                      </span>
                      <span className="text-muted-foreground text-[11px]">→</span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded tabular-nums font-bold"
                        style={{ background: "oklch(0.63 0.23 25 / 0.12)", color: "var(--bv-red)" }}>
                        {fmtEval(criticalMoment.evalAfter)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {storyNarrative(criticalMoment.move, criticalMoment.evalBefore, criticalMoment.evalAfter).cause}
                </p>
              </button>
              {criticalMoments.length >= 2 && (
                <button onClick={startStory}
                  className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: "var(--bv-purple)" }}>
                  Ver la historia: {criticalMoments.length} momentos clave →
                </button>
              )}
            </div>
          )}

          {/* Board + eval bar (bar on top, board edge-to-edge) */}
          <div className="space-y-2 -mx-4">
            <div className="px-4"><EvalBar moves={moves} idx={inExplore ? -1 : idx} /></div>
            <div className="relative"
              onTouchStart={!inExplore ? onTouchStart : undefined}
              onTouchEnd={!inExplore ? onTouchEnd : undefined}>
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

          {/* Summary footer — engine best at the turning point, accuracy vs your
              average, and total errors. Objective, game-level facts. */}
          {(() => {
            const accDelta = accuracy != null && avgAccuracy != null ? Math.round((accuracy - avgAccuracy) * 10) / 10 : null;
            return (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl p-3 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star size={12} style={{ color: "var(--bv-green)" }} />
                    <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Mejor jugada</p>
                  </div>
                  <p className="text-base font-bold font-mono leading-tight">{footerBest ?? "—"}</p>
                </div>
                <div className="rounded-xl p-3 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gauge size={12} style={{ color: "var(--bv-purple)" }} />
                    <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Precisión</p>
                  </div>
                  <p className="text-base font-bold leading-tight">{accuracy != null ? `${accuracy}%` : "—"}</p>
                  {accDelta != null && (
                    <p className="text-[10px] font-semibold" style={{ color: accDelta >= 0 ? "var(--bv-green)" : "var(--bv-red)" }}>
                      {accDelta >= 0 ? "+" : ""}{accDelta}% vs tu promedio
                    </p>
                  )}
                </div>
                <div className="rounded-xl p-3 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <XCircle size={12} style={{ color: "var(--bv-red)" }} />
                    <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">Errores</p>
                  </div>
                  <p className="text-base font-bold leading-tight" style={{ color: blunderCount > 0 ? "var(--bv-red)" : "var(--bv-green)" }}>
                    {blunderCount + mistakeCount}
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Tab: Jugadas ─────────────────────────────────────── */}
      {tab === "jugadas" && (
        <div className="space-y-3">
          {/* Mini board for reference */}
          <div className="space-y-2 -mx-4">
            <div className="px-4"><EvalBar moves={moves} idx={idx} /></div>
            <ChessBoard fen={currentFen} orientation={playedAs} lastMove={lastMove} />
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
          <div className="space-y-2 -mx-4">
            <div className="px-4"><EvalBar moves={moves} idx={Math.max(-1, practiceBlunderIdx! - 1)} /></div>
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
