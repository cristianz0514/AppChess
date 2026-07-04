"use client";

import { useState } from "react";

// Use the FILLED glyphs for both colors so pieces read on a LIGHT board;
// colour + outline distinguish white from black.
const PIECE_UNICODE: Record<string, string> = {
  K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

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
                  <span style={{
                    color: isWhitePiece ? "#ffffff" : "#26222e",
                    // White pieces get a dark outline so they read on white squares;
                    // black pieces get a soft drop shadow for depth.
                    textShadow: isWhitePiece
                      ? "-1px -1px 0 #4a4658, 1px -1px 0 #4a4658, -1px 1px 0 #4a4658, 1px 1px 0 #4a4658, 0 2px 3px rgba(0,0,0,0.25)"
                      : "0 1px 2px rgba(0,0,0,0.25)",
                    userSelect: "none",
                  }}>
                    {PIECE_UNICODE[piece] ?? piece}
                  </span>
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
            style={{
              position: "absolute",
              left: `${x + 4}%`,
              top: `${y - 4.4}%`,
              transform: "translate(-50%, -50%)",
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
