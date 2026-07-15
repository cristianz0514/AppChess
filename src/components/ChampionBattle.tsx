"use client";

import { useState, useCallback } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import { play as playSound } from "@/lib/sound";

export type BattleResult = "win" | "loss" | "draw";

interface Props {
  playerColor: "white" | "black";
  opponentName: string;
  eloTarget: number;
  onGameOver: (result: BattleResult) => void;
}

// A real, live chess game against the engine at an approximate target ELO
// (see getMoveAtElo/strengthForElo in services/stockfish.ts) — not a
// pre-solved puzzle. The player can genuinely win, lose, or draw.
export function ChampionBattle({ playerColor, opponentName, eloTarget, onGameOver }: Props) {
  const [fen, setFen] = useState(() => new Chess().fen());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [over, setOver] = useState(false);
  const playerChar = playerColor === "white" ? "w" : "b";

  const finishIfOver = useCallback((chess: Chess): boolean => {
    if (!chess.isGameOver()) return false;
    setOver(true);
    if (chess.isCheckmate()) {
      // The side to move is the one in checkmate — if it's NOT the player's
      // color, the player just delivered mate.
      const winner: BattleResult = chess.turn() !== playerChar ? "win" : "loss";
      playSound(winner === "win" ? "brilliant" : "error");
      onGameOver(winner);
    } else {
      playSound("move");
      onGameOver("draw");
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
      const chess = new Chess(afterFen);
      let played;
      try { played = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" }); } catch { played = null; }
      if (played) {
        setFen(chess.fen());
        setLastMove({ from: mv.from, to: mv.to });
        playSound(played.san.includes("x") ? "capture" : /[+#]/.test(played.san) ? "check" : "move");
        finishIfOver(chess);
      }
    } catch {
      /* rival move failed — player can just keep playing once retried on their next move */
    } finally {
      setThinking(false);
    }
  }

  function handleMove(from: string, to: string, promotion?: "q" | "r" | "b" | "n") {
    if (over || thinking) return;
    const chess = new Chess(fen);
    if (chess.turn() !== playerChar) return;
    let played;
    try { played = chess.move({ from, to, promotion: promotion ?? "q" }); } catch { played = null; }
    if (!played) return;

    setFen(chess.fen());
    setLastMove({ from, to });
    playSound(played.san.includes("x") ? "capture" : /[+#]/.test(played.san) ? "check" : "move");

    if (!finishIfOver(chess)) {
      requestRivalMove(chess.fen());
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          Vs {opponentName} · ELO {eloTarget}
        </p>
        {thinking && (
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--bv-purple)" }}>
            <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
            Pensando…
          </p>
        )}
      </div>
      <div className="-mx-4">
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
