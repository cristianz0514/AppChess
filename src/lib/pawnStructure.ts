// Pawn structure — pure geometry, no engine, no cost.
//
// Structure is what separates "quedas peor" from a reason. A club player who
// hears "te quedas con peones doblados y aislados en la columna c" learns
// something they can use in the next game; "cedes algo de terreno" teaches
// nothing. And unlike tactics, structure is permanent — it's the part of the
// position the player will still be living with twenty moves later.

import { piecesOf, type Color } from "./attackMap";

export interface PawnFacts {
  doubledFiles: string[];   // files where you have 2+ pawns
  isolated: string[];       // squares of pawns with no friendly pawn beside them
  backward: string[];       // squares of pawns that can't advance and can't be supported
  passed: string[];         // squares of pawns no enemy pawn can stop
  connectedPassed: string[];// passed pawns with a friendly neighbour
  islands: number;          // groups of pawns on consecutive files
}

const FILES = "abcdefgh";
const fileIdx = (s: string) => FILES.indexOf(s[0]);
const rank = (s: string) => Number(s[1]);

export function pawnStructure(fen: string, color: Color): PawnFacts {
  const all = piecesOf(fen).filter((p) => p.type === "p");
  const mine = all.filter((p) => p.color === color).map((p) => p.square);
  const theirs = all.filter((p) => p.color !== color).map((p) => p.square);
  const fwd = color === "w" ? 1 : -1;

  const byFile = new Map<number, number[]>();  // file index -> ranks
  for (const s of mine) {
    const f = fileIdx(s);
    byFile.set(f, [...(byFile.get(f) ?? []), rank(s)]);
  }

  const doubledFiles = [...byFile.entries()].filter(([, rs]) => rs.length >= 2).map(([f]) => FILES[f]);

  // Islands: count runs of occupied consecutive files.
  let islands = 0;
  for (let f = 0; f < 8; f++) {
    if (byFile.has(f) && !byFile.has(f - 1)) islands++;
  }

  const isolated: string[] = [];
  const backward: string[] = [];
  const passed: string[] = [];

  for (const s of mine) {
    const f = fileIdx(s), r = rank(s);
    const neighbourFiles = [f - 1, f + 1].filter((x) => x >= 0 && x < 8);
    const neighbours = neighbourFiles.flatMap((x) => byFile.get(x) ?? []);

    if (neighbours.length === 0) isolated.push(s);

    // Passed: no enemy pawn on this file or either neighbour, anywhere ahead.
    const blocked = theirs.some((t) => {
      const tf = fileIdx(t), tr = rank(t);
      if (Math.abs(tf - f) > 1) return false;
      return fwd === 1 ? tr > r : tr < r;
    });
    if (!blocked) passed.push(s);

    // Backward: it's the rearmost pawn of its little group (no friendly pawn on
    // an adjacent file at or behind its rank, so nothing can ever support its
    // advance) AND the square in front is covered by an enemy pawn.
    const supportBehind = neighbours.some((nr) => (fwd === 1 ? nr <= r : nr >= r));
    const aheadSq = r + fwd;
    const frontCoveredByEnemyPawn = theirs.some((t) => {
      const tf = fileIdx(t), tr = rank(t);
      return Math.abs(tf - f) === 1 && tr === aheadSq + fwd;
    });
    if (!supportBehind && frontCoveredByEnemyPawn && !isolated.includes(s)) backward.push(s);
  }

  const connectedPassed = passed.filter((s) => {
    const f = fileIdx(s);
    return passed.some((o) => o !== s && Math.abs(fileIdx(o) - f) === 1);
  });

  return { doubledFiles, isolated, backward, passed, connectedPassed, islands };
}

export interface StructureChange {
  gaveSelfDoubled: string | null;   // file where YOU now have doubled pawns
  gaveSelfIsolated: string | null;  // square of a pawn of yours that became isolated
  createdPassed: string | null;     // square of a passed pawn you just created
  brokeTheirStructure: string | null; // file where the OPPONENT now has doubled pawns
  isolatedTheirs: string | null;    // square of an enemy pawn you just isolated
}

/**
 * What the move changed, not what the position happens to contain — a pawn that
 * was already doubled ten moves ago is not news, the move that doubled it is.
 */
export function structureChange(fenBefore: string, fenAfter: string, color: Color): StructureChange {
  const enemy: Color = color === "w" ? "b" : "w";
  const b = pawnStructure(fenBefore, color), a = pawnStructure(fenAfter, color);
  const eb = pawnStructure(fenBefore, enemy), ea = pawnStructure(fenAfter, enemy);

  const newIn = (before: string[], after: string[]) => after.find((x) => !before.includes(x)) ?? null;

  return {
    gaveSelfDoubled: newIn(b.doubledFiles, a.doubledFiles),
    gaveSelfIsolated: newIn(b.isolated, a.isolated),
    createdPassed: newIn(b.passed, a.passed),
    brokeTheirStructure: newIn(eb.doubledFiles, ea.doubledFiles),
    isolatedTheirs: newIn(eb.isolated, ea.isolated),
  };
}
