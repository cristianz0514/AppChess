"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Piece } from "./pieces";

function parseFen(fen: string): Array<Array<string | null>> {
  const board: Array<Array<string | null>> = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = fen.split(" ")[0].split("/");
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank] ?? "") {
      if (/\d/.test(ch)) { file += parseInt(ch); }
      else { board[rank][file] = ch; file++; }
    }
  }
  return board;
}

function sqToColRow(sq: string, orientation: "white" | "black"): { col: number; row: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return {
    col: orientation === "white" ? file : 7 - file,
    row: orientation === "white" ? 7 - rank : rank,
  };
}

function sqToXYPct(sq: string, orientation: "white" | "black"): { x: number; y: number } {
  const { col, row } = sqToColRow(sq, orientation);
  return { x: (col + 0.5) / 8 * 100, y: (row + 0.5) / 8 * 100 };
}

export interface Arrow {
  from: string;
  to: string;
  color?: string;
}

interface Props {
  fen: string;
  orientation?: "white" | "black";
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  interactive?: boolean;
  onMove?: (from: string, to: string) => void;
  // Badge (emoji) shown over the destination square of the last move, chess.com style.
  lastMoveBadge?: { emoji: string; color: string } | null;
}

export function ChessBoard({
  fen,
  orientation = "white",
  lastMove,
  arrows = [],
  interactive = false,
  onMove,
  lastMoveBadge,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const board = parseFen(fen);
  const turnColor = fen.split(" ")[1] === "w" ? "white" : "black";

  const highlightSquares = new Set<string>();
  if (lastMove) { highlightSquares.add(lastMove.from); highlightSquares.add(lastMove.to); }

  // Piece-slide animation (FLIP technique) — both chess.com and lichess slide
  // the moved piece from its origin to destination; ours used to teleport
  // (instant re-render on the new FEN, no transition at all). We only track
  // the DESTINATION square's piece element: on each new lastMove, snap it
  // instantly to an offset equal to (origin - destination) in square units,
  // force a reflow, then transition that offset back to zero — the piece
  // visually slides in. Covers the primary moved piece; castling's rook and
  // en passant's captured pawn still teleport (rare enough to accept).
  const slideRef = useRef<HTMLDivElement | null>(null);
  const prevMoveKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!lastMove) return;
    const key = `${lastMove.from}-${lastMove.to}`;
    if (prevMoveKey.current === key) return;
    prevMoveKey.current = key;
    const el = slideRef.current;
    if (!el) return;
    const from = sqToColRow(lastMove.from, orientation);
    const to = sqToColRow(lastMove.to, orientation);
    const dx = (from.col - to.col) * 100;
    const dy = (from.row - to.row) * 100;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}%, ${dy}%)`;
    void el.offsetHeight; // force reflow so the instant offset commits before animating
    el.style.transition = "transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)";
    el.style.transform = "translate(0, 0)";
  }, [lastMove?.from, lastMove?.to, orientation]);

  // Legal-move dots/rings for the selected piece — standard on lichess and
  // chess.com, and genuinely useful for a learning product (shows exactly
  // where you CAN go instead of clicking blind and getting a shake on a miss).
  const legalTargets = useMemo(() => {
    if (!selected || !interactive) return new Set<string>();
    try {
      const chess = new Chess(fen);
      return new Set(chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to));
    } catch {
      return new Set<string>();
    }
  }, [selected, fen, interactive]);

  function sqLabel(displayRow: number, displayCol: number): string {
    const file = orientation === "white" ? displayCol : 7 - displayCol;
    const rank = orientation === "white" ? 8 - displayRow : displayRow + 1;
    return String.fromCharCode(97 + file) + rank;
  }

  function pieceAt(displayRow: number, displayCol: number): string | null {
    const file = orientation === "white" ? displayCol : 7 - displayCol;
    const rank = orientation === "white" ? displayRow : 7 - displayRow;
    return board[rank]?.[file] ?? null;
  }

  function pieceColor(piece: string): "white" | "black" {
    return piece === piece.toUpperCase() ? "white" : "black";
  }

  function handleClick(sq: string) {
    if (!interactive || !onMove) return;
    const piece = (() => {
      const { col, row } = sqToColRow(sq, orientation);
      const file = orientation === "white" ? col : 7 - col;
      const rank = orientation === "white" ? row : 7 - row;
      return board[rank]?.[file] ?? null;
    })();

    if (selected === null) {
      if (piece && pieceColor(piece) === turnColor) setSelected(sq);
    } else if (selected === sq) {
      setSelected(null);
    } else if (piece && pieceColor(piece) === turnColor) {
      setSelected(sq);
    } else {
      onMove(selected, sq);
      setSelected(null);
    }
  }

  return (
    <div
      className="w-full aspect-square rounded-xl select-none relative overflow-hidden"
      style={{ border: "2px solid var(--border)", containerType: "inline-size" }}
    >
      {/* Board grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          width: "100%",
          height: "100%",
        }}
      >
        {Array.from({ length: 8 }, (_, rowIdx) =>
          Array.from({ length: 8 }, (_, colIdx) => {
            const sq = sqLabel(rowIdx, colIdx);
            const piece = pieceAt(rowIdx, colIdx);
            const isDark = (rowIdx + colIdx) % 2 === 1;
            const isHighlighted = highlightSquares.has(sq);
            const isSelected = selected === sq;
            const isWhitePiece = piece !== null && piece === piece.toUpperCase();

            // Light board — white + soft lavender. Last-move highlight is a warm
            // YELLOW (not purple) so it never blends into the lavender squares.
            let bg = isDark ? "#dcd6f2" : "#faf9ff";
            if (isHighlighted) bg = isDark ? "rgba(255,193,7,0.55)" : "rgba(255,205,40,0.5)";
            // Selected piece: bright amber + inset ring — unmistakable.
            if (isSelected) bg = "#ffd23f";

            return (
              <div
                key={sq}
                onClick={() => handleClick(sq)}
                style={{
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  fontSize: "10.5cqi",
                  lineHeight: 1,
                  cursor: interactive ? "pointer" : "default",
                  boxShadow: isSelected ? "inset 0 0 0 0.7cqi rgba(200,140,0,0.95)" : undefined,
                }}
              >
                {piece && (
                  <div
                    ref={lastMove?.to === sq ? slideRef : undefined}
                    style={{ width: "88%", height: "88%", position: "relative", zIndex: 1 }}
                  >
                    <Piece type={piece.toLowerCase() as "k" | "q" | "r" | "b" | "n" | "p"} white={isWhitePiece} />
                  </div>
                )}
                {legalTargets.has(sq) && (
                  piece ? (
                    // Capture target — a ring around the edge of the square.
                    <div aria-hidden style={{
                      position: "absolute", inset: "4%", borderRadius: "9999px",
                      boxShadow: "inset 0 0 0 0.55cqi rgba(38,36,46,0.35)", pointerEvents: "none",
                    }} />
                  ) : (
                    // Empty destination — a small centered dot.
                    <div aria-hidden style={{
                      position: "absolute", width: "28%", height: "28%", borderRadius: "9999px",
                      background: "rgba(38,36,46,0.28)", pointerEvents: "none",
                    }} />
                  )
                )}
                {colIdx === 0 && (
                  <span style={{
                    position: "absolute", top: 2, left: 3,
                    fontSize: "2.2cqi",
                    color: isDark ? "#8b82ad" : "#c9c2e0",
                    fontWeight: 700, lineHeight: 1,
                  }}>
                    {orientation === "white" ? 8 - rowIdx : rowIdx + 1}
                  </span>
                )}
                {rowIdx === 7 && (
                  <span style={{
                    position: "absolute", bottom: 2, right: 3,
                    fontSize: "2.2cqi",
                    color: isDark ? "#8b82ad" : "#c9c2e0",
                    fontWeight: 700, lineHeight: 1,
                  }}>
                    {String.fromCharCode(97 + (orientation === "white" ? colIdx : 7 - colIdx))}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SVG overlay for arrows */}
      {arrows.length > 0 && (
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            {["red", "green", "blue", "orange"].map(c => {
              const colMap: Record<string, string> = {
                red: "#E5484D", green: "#0BA678", blue: "#6D4AED", orange: "#E0852B",
              };
              return (
                <marker key={c} id={`arrow-${c}`} markerWidth="4" markerHeight="4"
                  refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,4 L4,2 z" fill={colMap[c]} />
                </marker>
              );
            })}
          </defs>
          {arrows.map((arrow, i) => {
            const from = sqToXYPct(arrow.from, orientation);
            const to   = sqToXYPct(arrow.to,   orientation);
            const c = arrow.color ?? "blue";
            const colMap: Record<string, string> = {
              red: "#E5484D", green: "#0BA678", blue: "#6D4AED", orange: "#E0852B",
            };
            const stroke = colMap[c] ?? c;
            // Shorten line slightly so it doesn't overlap the arrowhead
            const dx = to.x - from.x, dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const ux = dx / len, uy = dy / len;
            const ex = to.x - ux * 3, ey = to.y - uy * 3;
            return (
              <line key={i}
                x1={from.x} y1={from.y} x2={ex} y2={ey}
                stroke={stroke} strokeWidth="2.5" strokeOpacity="0.82"
                markerEnd={`url(#arrow-${c})`}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      )}

      {/* Last-move classification badge (chess.com style) on the destination square */}
      {lastMoveBadge && lastMove && (() => {
        const { x, y } = sqToXYPct(lastMove.to, orientation);
        return (
          <div
            key={lastMove.to + lastMoveBadge.emoji}
            style={{
              position: "absolute",
              left: `${x + 4}%`,
              top: `${y - 4.4}%`,
              transform: "translate(-50%, -50%)",
              animation: "bvBadgePop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) both",
              width: "5cqi",
              height: "5cqi",
              borderRadius: "9999px",
              background: lastMoveBadge.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "3cqi",
              fontWeight: 700,
              lineHeight: 1,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {lastMoveBadge.emoji}
          </div>
        );
      })()}
    </div>
  );
}
