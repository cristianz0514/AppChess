"use client";

import { useState, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface MoveInfo {
  san: string;
  fen: string;
  moveNumber: number;
  color: "w" | "b";
  classification?: string | null;
}

function classificationColor(c?: string | null) {
  if (!c) return undefined;
  const map: Record<string, string> = {
    blunder:    "var(--bv-red)",
    mistake:    "var(--bv-orange)",
    inaccuracy: "#FFD700",
    best:       "var(--bv-green)",
    excellent:  "var(--bv-green)",
    good:       "var(--bv-green)",
  };
  return map[c];
}

function classificationEmoji(c?: string | null) {
  if (!c) return "";
  const map: Record<string, string> = {
    blunder: "?? ", mistake: "? ", inaccuracy: "?! ",
    best: "!!", excellent: "!", good: "",
  };
  return map[c] ?? "";
}

function buildMoves(pgn: string, dbMoves?: Array<{ move_number: number; classification: string | null }>): MoveInfo[] {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return []; }

  const history = chess.history({ verbose: true });
  const classMap = new Map<string, string | null>();
  if (dbMoves) {
    for (const m of dbMoves) {
      classMap.set(String(m.move_number), m.classification);
    }
  }

  const game = new Chess();
  const moves: MoveInfo[] = [];

  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    game.move(h.san);
    const moveNumber = Math.floor(i / 2) + 1;
    moves.push({
      san: h.san,
      fen: game.fen(),
      moveNumber,
      color: h.color,
      classification: classMap.get(String(i + 1)) ?? null,
    });
  }

  return moves;
}

interface Props {
  pgn: string;
  playedAs: "white" | "black";
  dbMoves?: Array<{ move_number: number; classification: string | null }>;
  jumpToBlunder?: boolean;
}

export function GameViewer({ pgn, playedAs, dbMoves, jumpToBlunder }: Props) {
  const moves = buildMoves(pgn, dbMoves);

  const firstBlunderIdx = jumpToBlunder
    ? moves.findIndex((m) => m.classification === "blunder")
    : -1;

  const [idx, setIdx] = useState(firstBlunderIdx >= 0 ? firstBlunderIdx : moves.length - 1);

  const currentFen = idx >= 0 ? moves[idx].fen : new Chess().fen();
  const currentMove = idx >= 0 ? moves[idx] : null;

  const go = useCallback((n: number) => setIdx(Math.max(-1, Math.min(moves.length - 1, n))), [moves.length]);

  // Highlight blunders on board
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (currentMove?.classification === "blunder") {
    // The move destination square — we just tint the whole board differently via a border
  }

  return (
    <div className="space-y-4">
      {/* Board */}
      <div className="rounded-2xl overflow-hidden border border-border">
        <Chessboard
          key={currentFen}
          position={currentFen}
          boardOrientation={playedAs}
          arePiecesDraggable={false}
          customBoardStyle={{ borderRadius: 0 }}
          customDarkSquareStyle={{ backgroundColor: "oklch(0.28 0.06 265)" }}
          customLightSquareStyle={{ backgroundColor: "oklch(0.55 0.06 265)" }}
        />
      </div>

      {/* Move info */}
      {currentMove && (
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground mr-1">
              {currentMove.color === "w" ? currentMove.moveNumber + "." : currentMove.moveNumber + "..."}
            </span>
            <span className="text-sm font-bold">
              {classificationEmoji(currentMove.classification)}{currentMove.san}
            </span>
          </div>
          {currentMove.classification && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
              style={{
                background: `${classificationColor(currentMove.classification)}22`,
                color: classificationColor(currentMove.classification),
              }}>
              {currentMove.classification}
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {[
          { icon: ChevronsLeft,  action: () => go(-1),       label: "Start" },
          { icon: ChevronLeft,   action: () => go(idx - 1),  label: "Prev" },
          { icon: ChevronRight,  action: () => go(idx + 1),  label: "Next" },
          { icon: ChevronsRight, action: () => go(moves.length - 1), label: "End" },
        ].map(({ icon: Icon, action, label }) => (
          <button key={label} onClick={action}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-card border border-border hover:bg-muted transition-colors"
            aria-label={label}>
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Move list */}
      <div className="bg-card border border-border rounded-2xl p-3 max-h-48 overflow-y-auto">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {moves.map((m, i) => {
            const isActive = i === idx;
            const color = classificationColor(m.classification);
            return (
              <button key={i} onClick={() => go(i)}
                className="text-xs px-1.5 py-0.5 rounded font-mono transition-colors"
                style={{
                  background: isActive ? "var(--bv-green)" : "transparent",
                  color: isActive ? "#000" : color ?? "var(--foreground)",
                  fontWeight: m.classification ? 700 : 400,
                }}>
                {m.color === "w" && `${m.moveNumber}.`}
                {classificationEmoji(m.classification)}{m.san}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
