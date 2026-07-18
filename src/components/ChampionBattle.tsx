"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { Hourglass } from "lucide-react";
import { ChessBoard } from "./ChessBoard";
import { Piece } from "./pieces";
import { play as playSound } from "@/lib/sound";

export type BattleResult = "win" | "loss" | "draw";

interface Props {
  playerColor: "white" | "black";
  opponentName: string;
  eloTarget: number;
  // Carries the finished game's PGN too — so the result screen can offer to
  // send this exact battle through the app's own Stockfish analysis, the way
  // any chess.com import can be reviewed move by move.
  onGameOver: (result: BattleResult, pgn: string) => void;
}

// Same convention as GameViewer's CapturedTray: byWhite = pieces WHITE has
// captured (i.e. black pieces taken off the board), and vice versa.
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function CapturedTray({ byWhite, byBlack }: { byWhite: string[]; byBlack: string[] }) {
  if (byWhite.length === 0 && byBlack.length === 0) return null;
  const byValueDesc = (a: string, b: string) => (PIECE_VALUE[b] ?? 0) - (PIECE_VALUE[a] ?? 0);
  const whiteSorted = [...byWhite].sort(byValueDesc);
  const blackSorted = [...byBlack].sort(byValueDesc);
  const diff = whiteSorted.reduce((s, p) => s + (PIECE_VALUE[p] ?? 0), 0)
    - blackSorted.reduce((s, p) => s + (PIECE_VALUE[p] ?? 0), 0);

  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center">
        {whiteSorted.map((p, i) => (
          <span key={i} style={{ width: 14, height: 14, marginLeft: i > 0 ? -4 : 0 }}>
            <Piece type={p as "p" | "n" | "b" | "r" | "q"} white={false} />
          </span>
        ))}
        {diff > 0 && <span className="ml-1.5 text-[10px] font-bold" style={{ color: "rgba(255,255,255,.7)" }}>+{diff}</span>}
      </div>
      <div className="flex items-center">
        {diff < 0 && <span className="mr-1.5 text-[10px] font-bold" style={{ color: "rgba(255,255,255,.7)" }}>+{-diff}</span>}
        {blackSorted.map((p, i) => (
          <span key={i} style={{ width: 14, height: 14, marginLeft: i > 0 ? -4 : 0 }}>
            <Piece type={p as "p" | "n" | "b" | "r" | "q"} white={true} />
          </span>
        ))}
      </div>
    </div>
  );
}

// A real, live chess game against the engine at an approximate target ELO
// (see getMoveAtElo/strengthForElo in services/stockfish.ts) — not a
// pre-solved puzzle. The player can genuinely win, lose, or draw.
export function ChampionBattle({ playerColor, opponentName, eloTarget, onGameOver }: Props) {
  // A single persistent instance for the whole game (not re-hydrated from FEN
  // per move) — FEN alone can't reconstruct PGN/move history, and the result
  // screen needs the full PGN to hand off to the analysis tool.
  const gameRef = useRef(new Chess());
  // Independent instance just for its default starting FEN — reading
  // gameRef.current here (in a useState initializer, which runs during
  // render) is a lint error, not just style: refs must never be read while
  // rendering.
  const [fen, setFen] = useState(() => new Chess().fen());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [over, setOver] = useState(false);
  // Material tray — was entirely absent, so a captured piece just vanished
  // with no feedback anywhere. Same byWhite/byBlack convention as GameViewer.
  const [captured, setCaptured] = useState<{ byWhite: string[]; byBlack: string[] }>({ byWhite: [], byBlack: [] });
  const playerChar = playerColor === "white" ? "w" : "b";
  const turnColor = fen.split(" ")[1] === "w" ? "w" : "b";
  const isPlayerTurn = turnColor === playerChar;

  function recordCapture(moverColor: "w" | "b", capturedType?: string) {
    if (!capturedType) return;
    setCaptured((prev) => moverColor === "w"
      ? { ...prev, byWhite: [...prev.byWhite, capturedType] }
      : { ...prev, byBlack: [...prev.byBlack, capturedType] });
  }

  const finishIfOver = useCallback((chess: Chess): boolean => {
    if (!chess.isGameOver()) return false;
    setOver(true);
    if (chess.isCheckmate()) {
      // The side to move is the one in checkmate — if it's NOT the player's
      // color, the player just delivered mate.
      const winner: BattleResult = chess.turn() !== playerChar ? "win" : "loss";
      playSound(winner === "win" ? "brilliant" : "error");
      onGameOver(winner, chess.pgn());
    } else {
      playSound("move");
      onGameOver("draw", chess.pgn());
    }
    return true;
  }, [playerChar, onGameOver]);

  async function requestRivalMove(afterFen: string) {
    setThinking(true);
    try {
      const res = await fetch("/api/champions/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: afterFen, elo: eloTarget }),
      });
      const data = await res.json().catch(() => null);
      const mv = data?.move as { from: string; to: string; promotion?: string } | null | undefined;
      if (!mv) { setThinking(false); return; }
      const chess = gameRef.current;
      let played;
      try { played = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" }); } catch { played = null; }
      if (played) {
        setFen(chess.fen());
        setLastMove({ from: mv.from, to: mv.to });
        recordCapture(played.color, played.captured);
        playSound(played.san.includes("x") ? "capture" : /[+#]/.test(played.san) ? "check" : "move");
        finishIfOver(chess);
      }
    } catch {
      /* rival move failed — player can just keep playing once retried on their next move */
    } finally {
      setThinking(false);
    }
  }

  // White always moves first — when the player is black, the rival needs to
  // open the game, but the only other call site for requestRivalMove was
  // inside handleMove, which never fires until the PLAYER makes a move. With
  // no move ever reaching the player first, the board just sat there frozen.
  // Guarded by a ref (not state) so React's dev-mode double-invoke of effects
  // can't ever request the opening move twice.
  const openingMoveRequested = useRef(false);
  useEffect(() => {
    if (playerColor !== "black" || openingMoveRequested.current) return;
    openingMoveRequested.current = true;
    requestRivalMove(gameRef.current.fen());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once on mount for a black-side game; requestRivalMove/gameRef are stable for the component's lifetime
  }, [playerColor]);

  function handleMove(from: string, to: string, promotion?: "q" | "r" | "b" | "n") {
    if (over || thinking) return;
    const chess = gameRef.current;
    if (chess.turn() !== playerChar) return;
    let played;
    try { played = chess.move({ from, to, promotion: promotion ?? "q" }); } catch { played = null; }
    if (!played) return;

    setFen(chess.fen());
    setLastMove({ from, to });
    recordCapture(played.color, played.captured);
    playSound(played.san.includes("x") ? "capture" : /[+#]/.test(played.san) ? "check" : "move");

    if (!finishIfOver(chess)) {
      requestRivalMove(chess.fen());
    }
  }

  return (
    <div className="space-y-3" style={{ animation: "bvFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,.7)" }}>
          Vs {opponentName} · ELO {eloTarget}
        </p>
        {/* Whose turn it is was previously only implied by board interactivity
            — nothing told the player who was supposed to move, and nothing
            announced the change for screen reader users either. */}
        <div aria-live="polite" aria-atomic="true">
          {!over && (
            thinking ? (
              // The "Pensando…" label used to vary the row's width/height
              // against "Tu turno"/"Turno de X", which could push the
              // captured-pieces tray and board down every time the engine
              // started thinking. A fixed-size spinning hourglass icon takes
              // its place instead — same footprint every time, no text.
              <p className="flex items-center" aria-label="Pensando" title="Pensando">
                <Hourglass size={14} className="animate-spin" style={{ color: "oklch(0.75 0.08 264)", animationDuration: "1.4s" }} />
              </p>
            ) : (
              <p className="text-xs font-semibold" style={{ color: isPlayerTurn ? "oklch(0.75 0.17 145)" : "rgba(255,255,255,.55)" }}>
                {isPlayerTurn ? "Tu turno" : `Turno de ${opponentName}`}
              </p>
            )
          )}
        </div>
      </div>
      <CapturedTray byWhite={captured.byWhite} byBlack={captured.byBlack} />
      {/* Edge-to-edge like the game-review board — a bigger board reads
          clearer during a live game than one boxed in by the scene's own
          padding, and ChessBoard already rounds its own corners. */}
      <div className="-mx-4 overflow-hidden">
        <ChessBoard
          fen={fen}
          orientation={playerColor}
          interactive={!over && !thinking}
          onMove={handleMove}
          lastMove={lastMove}
        />
      </div>
    </div>
  );
}
