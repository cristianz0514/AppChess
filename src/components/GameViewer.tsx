"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import type { Arrow } from "./ChessBoard";
import { ReviewSummaryModal } from "./ReviewSummaryModal";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart2, List, Brain, RotateCcw, Zap, Search, Target, CheckCircle2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { play as playSound, isMuted, toggleMuted } from "@/lib/sound";
import type { Game } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbMove {
  move_number: number;
  classification: string | null;
  centipawn_loss?: number | null;
  evaluation?: number | null;
  explanation?: string | null;
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
  explanation: string | null;  // short AI coach comment (precomputed), when available
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
  brilliant:  "#1BAAA6",  // teal — chess.com brilliant
  great:      "#5C8AE6",  // blue — chess.com great
  blunder:    "var(--bv-red)",
  mistake:    "var(--bv-orange)",
  inaccuracy: "#ffd700",
  best:       "var(--bv-green)",
  excellent:  "var(--bv-green)",
  good:       "var(--bv-green)",
};

// Simple monochrome glyphs (rendered white on a flat colored disc) — kept minimal
// so the board doesn't feel busy.
// Chess annotation glyphs: ‼ brilliant, ! great, ✓ best/excellent/good,
// ?! inaccuracy, ? mistake, ✕ blunder. (mistake was wrongly "!" before —
// which means a GOOD move — and collided with "great".)
const CLASS_EMOJI: Record<string, string> = {
  brilliant: "‼", great: "!", blunder: "✕", mistake: "?", inaccuracy: "?!", best: "✓", excellent: "✓", good: "✓",
};

const CLASS_LABEL: Record<string, string> = {
  brilliant: "¡Brillante!", great: "¡Genial!",
  blunder: "Error grave", mistake: "Error", inaccuracy: "Imprecisión",
  best: "La mejor jugada", excellent: "Excelente", good: "Buena jugada",
};

// Per-move coach line (chess.com style). Rule-based, concise, honest.
function moveComment(m: MoveInfo | null): { label: string; text: string; color: string } | null {
  if (!m || !m.classification) return null;
  const label = CLASS_LABEL[m.classification] ?? "";
  const color = CLASS_COLOR[m.classification] ?? "var(--muted-foreground)";
  const text = {
    brilliant: "¡Jugada brillante! Un sacrificio que funciona — de las mejores.",
    great: "¡Gran jugada! Encontraste el golpe clave.",
    blunder: "Perdiste ventaja importante. Mira cuál era la mejor jugada.",
    mistake: "Cediste algo de ventaja innecesariamente.",
    inaccuracy: "Había una jugada un poco mejor.",
    good: "Jugada sólida.",
    excellent: "Muy buena elección.",
    best: "La mejor jugada de la posición.",
  }[m.classification] ?? "";
  return { label, text, color };
}

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
      explanation: db?.explanation ?? null,
    };
  });
}

// ── Eval bar ──────────────────────────────────────────────────────────────────

function evalToWhitePct(ev: number | null): number {
  if (ev === null) return 50;
  if (ev >= 9000)  return 97;   // mate for white
  if (ev <= -9000) return 3;    // mate for black
  // Sigmoid scaled: ±4 pawns ≈ ±40%, clamped 5–95
  return Math.min(95, Math.max(5, 50 + ev * 10));
}

// Decodes distance-to-mate from an encoded eval (|eval| = 10000 − N).
function mateInN(ev: number): number {
  return Math.max(1, 10000 - Math.round(Math.abs(ev)));
}

function evalLabel(ev: number | null, whiteWinning: boolean): string {
  if (ev === null) return "";
  const abs = Math.abs(ev);
  if (abs >= 9000) return `Mate en ${mateInN(ev)}`;
  if (abs < 0.2)   return "Iguales";
  if (abs < 0.8)   return (whiteWinning ? "Blancas" : "Negras") + " mejor";
  if (abs < 2.0)   return (whiteWinning ? "Blancas" : "Negras") + " ganan";
  if (abs < 4.5)   return "Ventaja decisiva";
  return "Posición aplastante";
}

function evalScore(ev: number | null): string {
  if (ev === null) return "=";
  if (Math.abs(ev) >= 9000) return (ev > 0 ? "M" : "-M") + mateInN(ev);
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
  const isMate = hasRealData && Math.abs(ev) >= 9000;
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
  const [bestMoveSan, setBestMoveSan] = useState<string | null>(null);
  const [loadingBestMove, setLoadingBestMove] = useState(false);

  // Natural-language coach explanation (grounded in Stockfish), fetched on demand.
  const [explain, setExplain] = useState<{ idx: number; text: string } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

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
      playSound(m.san.includes("x") ? "capture" : /[+#]/.test(m.san) ? "check" : "move");
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
    setBestMoveSan(null);
    // Navigate to position before the blunder so the arrow makes sense visually
    setIdx(Math.max(-1, blunderIdx - 1));
    try {
      const r = await fetch(`/api/bestmove?fen=${encodeURIComponent(beforeFen)}`);
      if (r.ok) {
        const data = await r.json();
        if (data.from && data.to) {
          setBestMoveArrow({ from: data.from, to: data.to, color: "green" });
          // Name the move in SAN so the coach can say it, not just draw it.
          try {
            const c = new Chess(beforeFen);
            const mv = c.move({ from: data.from, to: data.to, promotion: data.promotion ?? "q" });
            if (mv) setBestMoveSan(mv.san);
          } catch {}
        }
      }
    } catch {}
    setLoadingBestMove(false);
  }

  // Ask the AI coach WHY a move was worse — grounded in the engine's best move
  // and the real eval swing. On demand only; the server caches the result.
  async function explainMove(i: number) {
    const m = moves[i];
    if (!m) return;
    const fenBefore = i > 0 ? moves[i - 1].fen : new Chess().fen();
    setExplainLoading(true);
    // Resolve the engine best move (SAN) to ground the explanation.
    let best = bestMoveSan ?? undefined;
    try {
      const r = await fetch(`/api/bestmove?fen=${encodeURIComponent(fenBefore)}`);
      if (r.ok) {
        const d = await r.json();
        if (d.from && d.to) {
          try {
            const c = new Chess(fenBefore);
            const mv = c.move({ from: d.from, to: d.to, promotion: d.promotion ?? "q" });
            if (mv) best = mv.san;
          } catch {}
        }
      }
    } catch {}
    const phase = m.moveNumber <= 10 ? "apertura" : m.moveNumber <= 25 ? "medio juego" : "final";
    try {
      const r = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fenBefore, san: m.san, bestMove: best, moveNumber: m.moveNumber,
          evalBefore: toMine(i > 0 ? moves[i - 1].evaluation : 0),
          evalAfter: toMine(m.evaluation), phase, gameId,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.text) setExplain({ idx: i, text: d.text });
      }
    } catch {}
    setExplainLoading(false);
  }

  const go = useCallback((n: number) => {
    setBestMoveArrow(null);
    setBestMoveSan(null);
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
    setBestMoveSan(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { setBestMoveArrow(null); setBestMoveSan(null); setIdx((c) => Math.max(-1, c - 1)); }
      else if (e.key === "ArrowRight") { setBestMoveArrow(null); setBestMoveSan(null); setIdx((c) => Math.min(moves.length - 1, c + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

  // Celebrate when YOU land on a Brilliant ‼ or Great ! move (chess.com-style delight).
  const [celebrate, setCelebrate] = useState<{ label: string; emoji: string; color: string } | null>(null);
  const playerColorEarly = playedAs === "white" ? "w" : "b";
  useEffect(() => {
    if (currentMove && currentMove.color === playerColorEarly &&
        (currentMove.classification === "brilliant" || currentMove.classification === "great")) {
      setCelebrate({
        label: CLASS_LABEL[currentMove.classification],
        emoji: CLASS_EMOJI[currentMove.classification],
        color: CLASS_COLOR[currentMove.classification] ?? "var(--bv-purple)",
      });
      const t = setTimeout(() => setCelebrate(null), 1700);
      return () => clearTimeout(t);
    }
    setCelebrate(null);
  }, [idx, currentMove, playerColorEarly]);

  // Sound: mute toggle (persisted) + a subtle cue when you navigate to a move.
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => { setSoundOn(!isMuted()); }, []);
  const didMountSound = useRef(false);
  useEffect(() => {
    if (!didMountSound.current) { didMountSound.current = true; return; }
    if (inExplore || inStory || idx < 0 || !currentMove) return;
    const san = currentMove.san;
    const cls = currentMove.classification;
    if (cls === "blunder" || cls === "mistake") playSound("error");
    else if (cls === "brilliant" || cls === "great") playSound("brilliant");
    else if (/[+#]/.test(san)) playSound("check");
    else if (san.includes("x")) playSound("capture");
    else playSound("move");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const blunderCount = useMemo(() => moves.filter(m => m.classification === "blunder").length, [moves]);
  const mistakeCount = useMemo(() => moves.filter(m => m.classification === "mistake").length, [moves]);

  // ── Critical moments: YOUR moves that swung the game most against you ───────
  const playerColor = playedAs === "white" ? "w" : "b";

  // Classification breakdown of YOUR moves (chess.com-style review summary).
  const classSummary = useMemo(() => {
    const counts: Record<string, number> = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    for (const m of moves) {
      if (m.color !== playerColor) continue;
      if (m.classification && counts[m.classification] !== undefined) counts[m.classification]++;
    }
    return counts;
  }, [moves, playerColor]);
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

  const fmtEval = (e: number | null) =>
    e === null ? "—" : Math.abs(e) >= 9000 ? (e > 0 ? "#" : "-#") + mateInN(e) : (e > 0 ? "+" : "") + e.toFixed(1);

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
      // Board sits BEFORE the move so the "played" (red) and "best" (green)
      // arrows both point from the real position the player faced.
      ...criticalMoments.map((cm) => ({ type: "moment" as const, cm, boardIdx: Math.max(-1, cm.idx - 1) })),
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
  const storyMomentSlide = currentSlide?.type === "moment" ? currentSlide : null;

  // Review-summary modal — pops up on open (chess.com style) unless we arrived
  // straight into Story Mode. Reopenable from the "Resumen" button.
  const gameAnalyzed = accuracy != null || moves.some((m) => m.classification);
  const [showSummary, setShowSummary] = useState(false);
  const summaryAutoOpened = useRef(false);
  useEffect(() => {
    // Pop the review summary shortly after load (unless we went straight to
    // Story Mode) — a clean closed→open entrance animation.
    if (summaryAutoOpened.current || autoStory || !gameAnalyzed) return;
    summaryAutoOpened.current = true;
    const t = setTimeout(() => setShowSummary(true), 350);
    return () => clearTimeout(t);
  }, [autoStory, gameAnalyzed]);

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

  // Coach comment (LLaMA) GROUNDED in the engine's best move — fetched once the
  // best move is known for the current moment. Cached per move index.
  const [aiComment, setAiComment] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!currentSlide || currentSlide.type !== "moment") return;
    const cm = currentSlide.cm;
    const best = storyBest[cm.idx];
    if (best === undefined) return;              // wait for the engine best move
    if (aiComment[cm.idx] !== undefined) return; // already fetched
    const fenBefore = cm.idx > 0 ? moves[cm.idx - 1].fen : new Chess().fen();
    const phase = cm.move.moveNumber <= 10 ? "apertura" : cm.move.moveNumber <= 25 ? "medio juego" : "final";
    let cancelled = false;
    setAiLoading(true);
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fenBefore, san: cm.move.san, bestMove: best, moveNumber: cm.move.moveNumber,
        evalBefore: cm.evalBefore, evalAfter: cm.evalAfter, phase, gameId,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.text) setAiComment((prev) => ({ ...prev, [cm.idx]: d.text })); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [currentSlide, storyBest, aiComment, moves, gameId]);

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

      {gameAnalyzed && (
        <ReviewSummaryModal
          open={showSummary}
          onClose={() => setShowSummary(false)}
          onReviewMoments={() => setShowSummary(false)}
          accuracy={accuracy ?? null}
          avgAccuracy={avgAccuracy ?? null}
          counts={classSummary}
          momentsCount={0}
          gameResult={gameResult}
        />
      )}

      {/* Coach IA "why" explanation — overlay so it never shifts the board */}
      {whyOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => setWhyOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(24,20,34,0.5)", backdropFilter: "blur(2px)" }} />
          <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} style={{ color: "var(--bv-purple)" }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                Coach IA
              </span>
              <button onClick={() => setWhyOpen(false)} aria-label="Cerrar"
                className="ml-auto w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 text-muted-foreground">
                ✕
              </button>
            </div>
            {currentMove && (
              <p className="text-sm font-bold mb-2 font-mono">
                {currentMove.moveNumber}{currentMove.color === "w" ? "." : "…"} {currentMove.san}
              </p>
            )}
            {explain?.idx === idx ? (
              <p className="text-sm leading-relaxed">{explain.text}</p>
            ) : explainLoading ? (
              <p className="text-sm text-muted-foreground">El coach está analizando con el motor…</p>
            ) : (
              <p className="text-sm text-muted-foreground">No se pudo obtener la explicación. Inténtalo de nuevo.</p>
            )}
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2 shrink-0">
          {gameAnalyzed && (
            <button onClick={() => setShowSummary(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold"
              style={{ borderColor: "var(--bv-purple)", color: "var(--bv-purple)" }}>
              <BarChart2 size={12} /> Resumen
            </button>
          )}
          <button
            onClick={() => { const on = !toggleMuted(); setSoundOn(on); if (on) playSound("move"); }}
            aria-label={soundOn ? "Silenciar sonidos" : "Activar sonidos"}
            title={soundOn ? "Silenciar sonidos" : "Activar sonidos"}
            className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors hover:bg-muted/40"
            style={{ borderColor: "var(--border)", color: soundOn ? "var(--bv-purple)" : "var(--muted-foreground)" }}>
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
      </div>

      {/* ── Tab: Analizar ────────────────────────────────────── */}
      {!inPractice && (
        <>


          {/* Coach line — precomputed AI comment inline; fixed height so the board never shifts */}
          {!inExplore && (() => {
            const c = moveComment(currentMove);
            const cls = currentMove?.classification ?? null;
            const isMine = currentMove?.color === playerColor;
            const curE = toMine(currentMove?.evaluation ?? null);
            const prevE = toMine(idx > 0 ? moves[idx - 1].evaluation : 0);
            const ai = currentMove?.explanation ?? null;
            let computed = c?.text ?? "";
            if (currentMove && c && isMine && curE != null && prevE != null && Math.abs(curE) < 9000 && Math.abs(prevE) < 9000) {
              const swing = curE - prevE;
              const to = fmtEval(curE);
              if (cls === "blunder" || cls === "mistake") computed = `Perdiste ${Math.abs(swing).toFixed(1)} (${fmtEval(prevE)} a ${to}).`;
              else if (cls === "inaccuracy") computed = `Imprecisa (${fmtEval(prevE)} a ${to}).`;
              else if (cls === "best" || cls === "excellent" || cls === "good") computed = curE >= 1 ? `Mantienes ventaja (${to}).` : curE <= -1 ? `Sigues peor (${to}).` : `Equilibrio (${to}).`;
            }
            const color = c?.color ?? "var(--muted-foreground)";
            const notableMine = isMine && (cls === "blunder" || cls === "mistake" || cls === "inaccuracy");
            const showWhy = !ai && notableMine && !!gameId;
            return (
              <div className="flex items-start gap-2 h-16 shrink-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white mt-0.5"
                  style={{ background: color }}>
                  {cls ? CLASS_EMOJI[cls] : "•"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color }}>
                    {currentMove
                      ? <><span className="font-mono">{currentMove.san}</span>{c ? ` — ${c.label}` : ""}</>
                      : "Posición inicial"}
                  </p>
                  {ai ? (
                    <p className="text-xs leading-snug line-clamp-2 flex items-start gap-1 text-foreground">
                      <Sparkles size={11} className="shrink-0 mt-0.5" style={{ color: "var(--bv-purple)" }} />
                      <span>{ai}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {computed || (currentMove ? "" : "Usa las flechas para revisar la partida.")}
                      {showWhy && (
                        <button onClick={() => { setWhyOpen(true); explainMove(idx); }}
                          className="ml-1 font-semibold" style={{ color: "var(--bv-purple)" }}>
                          · ¿Por qué?
                        </button>
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Board + eval bar (bar on top, board edge-to-edge) */}
          <div className="space-y-2 -mx-4" style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <div className="px-4"><EvalBar moves={moves} idx={inExplore ? -1 : idx} /></div>
            <div className="relative"
              onTouchStart={!inExplore ? onTouchStart : undefined}
              onTouchEnd={!inExplore ? onTouchEnd : undefined}>
              {/* Brilliant/Great celebration */}
              {celebrate && !inExplore && !storyMomentSlide && (
                <div className="absolute inset-x-0 top-3 z-20 flex justify-center pointer-events-none">
                  <div
                    key={celebrate.label + idx}
                    className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg"
                    style={{
                      background: celebrate.color,
                      color: "#fff",
                      animation: "bvCelebrate 1.7s cubic-bezier(0.34, 1.56, 0.64, 1) both",
                    }}
                  >
                    <span className="text-lg font-bold leading-none">{celebrate.emoji}</span>
                    <span className="text-sm font-bold">{celebrate.label}</span>
                  </div>
                </div>
              )}
              {/* Explore mode banner */}
              {inExplore && (
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 rounded-t-xl text-xs font-bold"
                  style={{ background: "oklch(0.61 0.22 285 / 0.92)", color: "#fff" }}>
                  <span className="flex items-center gap-1"><Search size={13} /> Exploración libre</span>
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
                lastMove={inExplore ? exploreLastMove : storyMomentSlide ? null : lastMove}
                arrows={
                  inExplore
                    ? []
                    : storyMomentSlide
                      ? [
                          { from: storyMomentSlide.cm.move.from, to: storyMomentSlide.cm.move.to, color: "red" },
                          ...(bestMoveArrow ? [bestMoveArrow] : []),
                        ]
                      : bestMoveArrow ? [bestMoveArrow] : []
                }
                interactive={inExplore}
                onMove={inExplore ? handleExploreMove : undefined}
                lastMoveBadge={!inExplore && !storyMomentSlide && currentMove?.classification && CLASS_EMOJI[currentMove.classification]
                  ? { emoji: CLASS_EMOJI[currentMove.classification], color: CLASS_COLOR[currentMove.classification] ?? "var(--bv-purple)" }
                  : null}
              />

            </div>
          </div>

          {/* Nav - arrows with the current move in the CENTER (chess.com style) */}
          {!inExplore && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => go(-1)} disabled={idx <= -1}
                className="w-10 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                title="Inicio" aria-label="Ir al inicio">
                <ChevronsLeft size={18} />
              </button>
              <button
                onClick={() => go(idx - 1)} disabled={idx <= -1}
                className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                title="Anterior" aria-label="Jugada anterior">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 max-w-[140px] text-center leading-tight">
                <p className="text-base font-bold font-mono">
                  {idx < 0 ? "Inicio" : `${moves[idx].moveNumber}${moves[idx].color === "w" ? "." : "…"} ${moves[idx].san}`}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{idx + 2}/{moves.length + 1}</p>
              </div>
              <button
                onClick={() => go(idx + 1)} disabled={idx >= moves.length - 1}
                className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                title="Siguiente" aria-label="Jugada siguiente">
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => go(moves.length - 1)} disabled={idx >= moves.length - 1}
                className="w-10 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-30"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                title="Final" aria-label="Ir al final">
                <ChevronsRight size={18} />
              </button>
            </div>
          )}

          {/* Action row - compact; opens overlays, never shifts the board */}
          {!inExplore && (
            <div className="flex items-center gap-2">
              <button onClick={enterExplore} title="Explorar variantes" aria-label="Explorar"
                className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95"
                style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }}>
                <Search size={18} />
              </button>
              <button onClick={() => fetchBestMove(idx)} disabled={loadingBestMove || idx < 0}
                className="flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white active:scale-[0.98] transition-transform disabled:opacity-40"
                style={{ background: "var(--bv-green)" }}>
                <Target size={16} /> {loadingBestMove ? "Calculando..." : "Mejor jugada"}
              </button>
              {idx >= 0 && currentMove?.color === playerColor && (currentMove?.classification === "blunder" || currentMove?.classification === "mistake") && (
                <button onClick={() => startPractice(idx)} title="Practicar esta posicion" aria-label="Practicar"
                  className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95"
                  style={{ borderColor: "var(--bv-purple)", color: "var(--bv-purple)" }}>
                  <Brain size={18} />
                </button>
              )}
            </div>
          )}
        </>
      )}



      {/* ── Modo Práctica ────────────────────────────────────── */}
      {inPractice && practiceFen && practiceMove && (
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


    </div>
  );
}
