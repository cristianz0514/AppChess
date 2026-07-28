// Attack tables — for every square, who attacks it and with what.
//
// This is the foundation engines build almost everything else on, and it's
// what we were missing: each detector used to re-derive its own geometry with
// chess.js `moves()`, which only ever answers for the side to move and hides
// anything a pin makes illegal. A defender that is pinned still DEFENDS — that
// distinction is exactly what an attack table gets right and legal-move
// enumeration gets wrong.
//
// One pass over the board gives, for free: hanging pieces, insufficient
// defenders, overloaded defenders, weak squares, and king-ring pressure.

import { Chess } from "chess.js";

export type Color = "w" | "b";

export interface Attacker {
  type: string;   // p n b r q k
  color: Color;
  from: string;
}

export type AttackMap = Map<string, Attacker[]>;

const FILES = "abcdefgh";
const sq = (f: number, r: number) => `${FILES[f]}${r}`;
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 1 && r <= 8;

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DIAG = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KING = [...DIAG, ...ORTHO];

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Squares a single piece attacks, ignoring pins and whose turn it is.
 * "Attacks" is deliberately not "can legally move to": a pawn attacks the two
 * diagonals in front of it even when they're empty, and does NOT attack the
 * square straight ahead even when it can move there.
 */
export function attacksFrom(
  type: string, color: Color, from: string,
  occupied: (s: string) => { type: string; color: Color } | null,
): string[] {
  const f = FILES.indexOf(from[0]);
  const r = Number(from[1]);
  const out: string[] = [];

  if (type === "p") {
    const dr = color === "w" ? 1 : -1;
    for (const df of [-1, 1]) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
    return out;
  }
  if (type === "n") {
    for (const [df, dr] of KNIGHT) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
    return out;
  }
  if (type === "k") {
    for (const [df, dr] of KING) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
    return out;
  }

  const rays = type === "b" ? DIAG : type === "r" ? ORTHO : KING;
  for (const [df, dr] of rays) {
    let cf = f + df, cr = r + dr;
    while (onBoard(cf, cr)) {
      const s = sq(cf, cr);
      out.push(s);
      // A ray stops at the first piece, but that square IS attacked (it can be
      // captured, or it's a defended friendly piece).
      if (occupied(s)) break;
      cf += df; cr += dr;
    }
  }
  return out;
}

export function buildAttackMap(fen: string): AttackMap {
  const map: AttackMap = new Map();
  const board = new Chess(fen).board();
  const at = new Map<string, { type: string; color: Color }>();
  for (const row of board) {
    for (const cell of row) if (cell) at.set(cell.square, { type: cell.type, color: cell.color as Color });
  }
  const occupied = (s: string) => at.get(s) ?? null;

  for (const [from, piece] of at) {
    for (const target of attacksFrom(piece.type, piece.color, from, occupied)) {
      const list = map.get(target);
      const entry: Attacker = { type: piece.type, color: piece.color, from };
      if (list) list.push(entry); else map.set(target, [entry]);
    }
  }
  return map;
}

export const attackersOf = (map: AttackMap, square: string, color: Color): Attacker[] =>
  (map.get(square) ?? []).filter((a) => a.color === color);

export interface BoardPiece { type: string; color: Color; square: string }

export function piecesOf(fen: string, color?: Color): BoardPiece[] {
  const out: BoardPiece[] = [];
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell && (!color || cell.color === color)) {
        out.push({ type: cell.type, color: cell.color as Color, square: cell.square });
      }
    }
  }
  return out;
}

/**
 * A defender is "overloaded" when it is the ONLY defender of two or more of its
 * own pieces that the opponent already attacks. Taking one forces it to let the
 * other go — a very common club-level loss that no other detector we have
 * catches, because each piece looks adequately defended on its own.
 */
export function overloadedDefender(fen: string, color: Color): { piece: string; duties: string[] } | null {
  const map = buildAttackMap(fen);
  const enemy: Color = color === "w" ? "b" : "w";
  const duties = new Map<string, string[]>();  // defender square -> squares it alone protects

  for (const p of piecesOf(fen, color)) {
    if (p.type === "k") continue;
    if (attackersOf(map, p.square, enemy).length === 0) continue;   // not under fire
    const defs = attackersOf(map, p.square, color);
    if (defs.length !== 1) continue;                                 // not a SOLE defender
    const d = defs[0].from;
    duties.set(d, [...(duties.get(d) ?? []), p.square]);
  }

  for (const [from, squares] of duties) {
    if (squares.length >= 2) {
      const piece = piecesOf(fen).find((p) => p.square === from);
      return { piece: piece?.type ?? "?", duties: squares };
    }
  }
  return null;
}

/**
 * Pieces attacked more times than they're defended, counting cheapest-attacker
 * first. Distinct from a plain hanging check (which only asks "is it defended
 * at all?") — a rook defended once but attacked by two minors is still lost.
 */
export function underDefended(fen: string, color: Color): { type: string; square: string }[] {
  const map = buildAttackMap(fen);
  const enemy: Color = color === "w" ? "b" : "w";
  const out: { type: string; square: string }[] = [];

  for (const p of piecesOf(fen, color)) {
    if (p.type === "k") continue;
    const att = attackersOf(map, p.square, enemy);
    if (att.length === 0) continue;
    const def = attackersOf(map, p.square, color);
    const cheapest = Math.min(...att.map((a) => PIECE_VALUE[a.type] ?? 0));
    // Either outnumbered, or attacked by something worth less than it is.
    if (att.length > def.length || cheapest < (PIECE_VALUE[p.type] ?? 0)) {
      if (def.length === 0 || att.length > def.length) out.push({ type: p.type, square: p.square });
    }
  }
  return out;
}

/** Enemy pieces bearing down on the ring of squares around a king. */
export function kingRingPressure(fen: string, color: Color): number {
  const map = buildAttackMap(fen);
  const enemy: Color = color === "w" ? "b" : "w";
  const king = piecesOf(fen, color).find((p) => p.type === "k");
  if (!king) return 0;
  const f = FILES.indexOf(king.square[0]), r = Number(king.square[1]);
  let pressure = 0;
  for (const [df, dr] of [[0, 0], ...KING]) {
    if (!onBoard(f + df, r + dr)) continue;
    pressure += attackersOf(map, sq(f + df, r + dr), enemy).length;
  }
  return pressure;
}
