"use client";

const PIECE_UNICODE: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function parseFen(fen: string): Array<Array<string | null>> {
  const board: Array<Array<string | null>> = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = fen.split(" ")[0].split("/");
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank] ?? "") {
      if (/\d/.test(ch)) {
        file += parseInt(ch);
      } else {
        board[rank][file] = ch;
        file++;
      }
    }
  }
  return board;
}

interface Props {
  fen: string;
  orientation?: "white" | "black";
  lastMove?: { from: string; to: string } | null;
}

export function ChessBoard({ fen, orientation = "white", lastMove }: Props) {
  const board = parseFen(fen);

  // Convert algebraic square to [rank, file] indices in the board array
  function sqToIdx(sq: string): [number, number] {
    const file = sq.charCodeAt(0) - 97; // a=0 … h=7
    const rank = 8 - parseInt(sq[1]);   // rank 8 = row 0
    return [rank, file];
  }

  const highlightSquares = new Set<string>();
  if (lastMove) {
    highlightSquares.add(lastMove.from);
    highlightSquares.add(lastMove.to);
  }

  function sqLabel(displayRank: number, displayFile: number): string {
    const file = orientation === "white" ? displayFile : 7 - displayFile;
    const rank = orientation === "white" ? 8 - displayRank : displayRank + 1;
    return String.fromCharCode(97 + file) + rank;
  }

  function pieceAt(displayRank: number, displayFile: number): string | null {
    const file = orientation === "white" ? displayFile : 7 - displayFile;
    const rank = orientation === "white" ? displayRank : 7 - displayRank;
    return board[rank]?.[file] ?? null;
  }

  return (
    <div className="w-full aspect-square rounded-2xl overflow-hidden border border-border select-none">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", width: "100%", height: "100%" }}>
        {Array.from({ length: 8 }, (_, rankIdx) =>
          Array.from({ length: 8 }, (_, fileIdx) => {
            const sq = sqLabel(rankIdx, fileIdx);
            const piece = pieceAt(rankIdx, fileIdx);
            const isDark = (rankIdx + fileIdx) % 2 === 1;
            const isHighlighted = highlightSquares.has(sq);
            const isWhitePiece = piece !== null && piece === piece.toUpperCase();

            let bg = isDark ? "#94a3b8" : "#f1f5f9";
            if (isHighlighted) bg = isDark ? "rgba(210,187,255,0.55)" : "rgba(210,187,255,0.35)";

            return (
              <div
                key={sq}
                style={{
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  fontSize: "clamp(18px, 5vw, 42px)",
                  lineHeight: 1,
                  cursor: "default",
                }}
              >
                {piece && (
                  <span
                    style={{
                      color: isWhitePiece ? "#ffffff" : "#1e293b",
                      textShadow: isWhitePiece
                        ? "0 1px 3px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.3)"
                        : "0 1px 0 rgba(255,255,255,0.4)",
                      userSelect: "none",
                    }}
                  >
                    {PIECE_UNICODE[piece] ?? piece}
                  </span>
                )}
                {/* Rank label on leftmost file */}
                {fileIdx === 0 && (
                  <span style={{
                    position: "absolute", top: 2, left: 3,
                    fontSize: "clamp(7px, 1.2vw, 10px)",
                    color: isDark ? "#f1f5f9" : "#64748b",
                    fontWeight: 700, lineHeight: 1,
                  }}>
                    {orientation === "white" ? 8 - rankIdx : rankIdx + 1}
                  </span>
                )}
                {/* File label on bottom rank */}
                {rankIdx === 7 && (
                  <span style={{
                    position: "absolute", bottom: 2, right: 3,
                    fontSize: "clamp(7px, 1.2vw, 10px)",
                    color: isDark ? "#f1f5f9" : "#64748b",
                    fontWeight: 700, lineHeight: 1,
                  }}>
                    {String.fromCharCode(97 + (orientation === "white" ? fileIdx : 7 - fileIdx))}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
