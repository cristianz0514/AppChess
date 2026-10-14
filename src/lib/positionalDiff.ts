// What a positional error actually cost: the difference between two END positions.
//
// When a move loses no material and allows no tactic, the engine still says it was an error —
// and the coach could only say "pasa de igualada a algo mejor". The reason is in the position
// the move leads to, a few moves later: the rook that now owns the open file, the bishop pair
// that is gone, the king that can no longer castle.
//
// So the question is asked of two positions, both taken from lines the engine returned: where
// the played move leads, and where the best move leads, a few plies down and quiet. A feature is
// reported only if it differs between them in the direction that hurts the mover, by a real
// margin. The statement is then a plain comparison of two boards — "en la línea principal el
// rival se hace con la columna c; con la mejor jugada la controlabas tú" — not a guess about
// why the evaluation moved.
//
// Pure geometry on top of the repo's own detectors (attack tables, pawn structure, piece-square
// tables). No engine, no clock.

import { piecesOf, PIECE_VALUE, type Color } from "./attackMap";
import { pawnStructure } from "./pawnStructure";
import { evalTerms } from "./evalTerms";
import { passivePiece, type PassivePiece } from "./pieceSquares";

const NAME: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const FILES = "abcdefgh";

export interface Profile {
  bishops: number;
  oppBishops: number;
  castled: boolean;
  castleRights: boolean;
  kingInCentre: boolean;
  queensOn: number;
  kingExposure: number;       // enemy attacks on the squares around the king
  shield: number;             // own pawns directly in front of the king
  doubled: string[];          // files with 2+ own pawns
  isolated: string[];         // squares of own isolated pawns
  oppPassed: string[];        // enemy passed pawns
  /** Squares of enemy KNIGHTS standing, advanced, where none of this side's pawns can ever attack them. */
  oppOutposts: string[];
  /** For each file with no pawns at all: own rooks+queens minus the enemy's. */
  fileControl: Record<string, number>;
  passive: PassivePiece | null;
  mobility: number;
  development: number;
  material: number;
}

export function profile(fen: string, me: Color): Profile {
  const opp: Color = me === "w" ? "b" : "w";
  const pieces = piecesOf(fen);
  const mine = pieces.filter((p) => p.color === me);
  const theirs = pieces.filter((p) => p.color === opp);
  const king = mine.find((p) => p.type === "k");
  const homeRank = me === "w" ? "1" : "8";
  const rights = (fen.split(" ")[2] ?? "-");
  const castleRights = me === "w" ? /[KQ]/.test(rights) : /[kq]/.test(rights);
  const castled = !!king && (king.square === (me === "w" ? "g1" : "g8") || king.square === (me === "w" ? "c1" : "c8"));
  const queensOn = pieces.filter((p) => p.type === "q").length;

  // The king still in the middle of the board with the queens on: the position where not having
  // castled is a real problem rather than an endgame technique.
  const kingInCentre = !!king && queensOn >= 1 && ["d", "e", "f"].includes(king.square[0]) && king.square[1] === homeRank;

  const kf = king ? FILES.indexOf(king.square[0]) : 0;
  const kr = king ? Number(king.square[1]) : 1;
  const fwd = me === "w" ? 1 : -1;
  let shield = 0;
  for (const p of mine) {
    if (p.type !== "p") continue;
    const pf = FILES.indexOf(p.square[0]);
    const dr = (Number(p.square[1]) - kr) * fwd;
    if (Math.abs(pf - kf) <= 1 && dr >= 1 && dr <= 2) shield++;
  }

  const ps = pawnStructure(fen, me);
  const eps = pawnStructure(fen, opp);

  const pawnFiles = new Set(pieces.filter((p) => p.type === "p").map((p) => p.square[0]));
  const fileControl: Record<string, number> = {};
  for (const f of FILES) {
    if (pawnFiles.has(f)) continue;
    const onFile = (list: typeof mine) => list.filter((p) => (p.type === "r" || p.type === "q") && p.square[0] === f).length;
    fileControl[f] = onFile(mine) - onFile(theirs);
  }

  // An enemy knight in the opponent's half that none of our pawns can attack now or later: a pawn
  // can challenge a square only from an adjacent file, standing behind it from the pawn's own
  // point of view. If there is no such pawn, nothing will ever dislodge the knight.
  const myPawns = mine.filter((p) => p.type === "p");
  const oppOutposts = theirs.filter((p) => {
    if (p.type !== "n") return false;
    const f = FILES.indexOf(p.square[0]), r = Number(p.square[1]);
    const advanced = opp === "w" ? r >= 4 : r <= 5;
    if (!advanced) return false;
    return !myPawns.some((q) => {
      const qf = FILES.indexOf(q.square[0]), qr = Number(q.square[1]);
      if (Math.abs(qf - f) !== 1) return false;
      return me === "w" ? qr <= r - 1 : qr >= r + 1;
    });
  }).map((p) => p.square);

  const terms = evalTerms(fen, me);
  return {
    bishops: mine.filter((p) => p.type === "b").length,
    oppBishops: theirs.filter((p) => p.type === "b").length,
    castled, castleRights, kingInCentre, queensOn,
    kingExposure: -terms.kingSafety,
    shield,
    doubled: ps.doubledFiles,
    isolated: ps.isolated,
    oppPassed: eps.passed,
    oppOutposts,
    fileControl,
    passive: passivePiece(fen, me),
    mobility: terms.mobility,
    development: terms.development,
    material: mine.reduce((s, p) => s + (PIECE_VALUE[p.type] ?? 0), 0) - theirs.reduce((s, p) => s + (PIECE_VALUE[p.type] ?? 0), 0),
  };
}

export type FeatureKey =
  | "oppPassed" | "bishopPairLost" | "bishopPairGiven" | "openFile" | "kingExposed"
  | "castling" | "shield" | "doubled" | "isolated" | "passive" | "mobility" | "development" | "oppOutpost";

export interface Difference {
  key: FeatureKey;
  /** How much it matters, on a common scale. A feature must reach MIN_SCORE to be reported. */
  score: number;
  /** Facts the sentence needs. */
  file?: string;
  square?: string;
  piece?: string;
  /** For a passive piece: boxed in by its own men, or standing on a poor square. */
  reason?: "entombed" | "badSquare";
  from?: number;
  to?: number;
  /** The best line had this in the mover's favour (it controlled the file, it had castled…). */
  bestHadIt?: boolean;
}

export const MIN_SCORE = 1.5;

/**
 * Everything that is WORSE for `me` at the end of the played line than at the end of the best
 * line, strongest first. Both profiles are from `me`'s point of view.
 */
export function differences(played: Profile, best: Profile, minScore = MIN_SCORE): Difference[] {
  const out: Difference[] = [];
  const push = (d: Difference) => { if (d.score >= minScore) out.push(d); };

  // A passed pawn the rival gets.
  const newPassed = played.oppPassed.find((s) => !best.oppPassed.includes(s));
  if (newPassed && played.oppPassed.length > best.oppPassed.length) push({ key: "oppPassed", score: 3, square: newPassed });

  // A knight the rival plants where no pawn of ours can ever remove it.
  const newOutpost = played.oppOutposts.find((s) => !best.oppOutposts.includes(s));
  if (newOutpost) push({ key: "oppOutpost", score: 2, square: newOutpost });

  // The bishop pair.
  if (best.bishops >= 2 && played.bishops < 2) push({ key: "bishopPairLost", score: 2 });
  if (played.oppBishops >= 2 && best.oppBishops < 2) push({ key: "bishopPairGiven", score: 2 });

  // An open file the rival controls and the best line did not give them.
  for (const f of Object.keys(played.fileControl)) {
    const p = played.fileControl[f], b = best.fileControl[f] ?? 0;
    if (p < 0 && p - b <= -1) push({ key: "openFile", score: 2, file: f, bestHadIt: b > 0 });
  }

  // The king.
  const exposure = played.kingExposure - best.kingExposure;
  if (exposure >= 2) push({ key: "kingExposed", score: 0.6 * exposure, from: best.kingExposure, to: played.kingExposure });
  if (played.queensOn >= 1 && played.kingInCentre && !played.castleRights && (best.castled || best.castleRights)) {
    push({ key: "castling", score: 2, bestHadIt: best.castled });
  }
  if (played.castled && best.castled && played.shield <= best.shield - 2) {
    push({ key: "shield", score: 1.5, from: best.shield, to: played.shield });
  }

  // Own pawn structure.
  const newDoubled = played.doubled.find((f) => !best.doubled.includes(f));
  if (newDoubled) push({ key: "doubled", score: 1.5, file: newDoubled });
  const newIsolated = played.isolated.find((s) => !best.isolated.includes(s));
  if (newIsolated && played.isolated.length > best.isolated.length) push({ key: "isolated", score: 1.5, square: newIsolated });

  // A piece with nowhere to go.
  if (played.passive && (!best.passive || best.passive.square !== played.passive.square)) {
    push({ key: "passive", score: 1.5, piece: played.passive.type, square: played.passive.square, reason: played.passive.reason });
  }

  // Activity and development, last: the vaguest, so they need the biggest gaps.
  const mob = best.mobility - played.mobility;
  if (mob >= 12) push({ key: "mobility", score: Math.min(3, mob * 0.12), from: best.mobility, to: played.mobility });
  const dev = best.development - played.development;
  if (dev >= 2 && played.queensOn >= 1) push({ key: "development", score: dev, from: best.development, to: played.development });

  return out.sort((a, b) => b.score - a.score);
}

const art = (t: string) => `${t === "r" || t === "q" ? "la" : "el"} ${NAME[t] ?? "pieza"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The sentence for one difference. `you` is the mover being the player (second person); otherwise
 * the mover is the rival and the sentence is told from the player's side. `contrast` is what the
 * best move did instead — only said to the player about their own move.
 */
export function describeDifference(d: Difference, you: boolean, bestMove: string | null): { cause: string; contrast: string | null } {
  const bp = bestMove ? `Con ${bestMove}` : null;
  const c = (tail: string) => (bp ? `${bp} ${tail}` : null);
  switch (d.key) {
    case "oppPassed":
      return you
        ? { cause: `En la línea principal el rival consigue un peón pasado en ${d.square}.`, contrast: c("lo evitabas.") }
        : { cause: `Con esa jugada consigues un peón pasado en ${d.square}.`, contrast: null };
    case "oppOutpost":
      return you
        ? { cause: `En la línea principal el caballo del rival se instala en ${d.square}, donde ningún peón tuyo puede echarlo.`, contrast: c("no se lo permitías.") }
        : { cause: `Tu caballo se instala en ${d.square}, donde ningún peón del rival puede echarlo.`, contrast: null };
    case "bishopPairLost":
      return you
        ? { cause: `En la línea principal te quedas sin la pareja de alfiles.`, contrast: c("la conservabas.") }
        : { cause: `El rival se queda sin la pareja de alfiles.`, contrast: null };
    case "bishopPairGiven":
      return you
        ? { cause: `En la línea principal el rival se queda con la pareja de alfiles.`, contrast: c("no se la dabas.") }
        : { cause: `Te quedas con la pareja de alfiles.`, contrast: null };
    case "openFile":
      return you
        ? { cause: `En la línea principal el rival se hace con la columna ${d.file}.`, contrast: c(d.bestHadIt ? "la controlabas tú." : "no se la dejabas.") }
        : { cause: `Te haces con la columna ${d.file}.`, contrast: null };
    case "kingExposed":
      return you
        ? { cause: `En la línea principal tu rey queda más expuesto: los ataques rivales sobre su zona pasan de ${d.from} a ${d.to}.`, contrast: c("estaba más a salvo.") }
        : { cause: `El rey del rival queda más expuesto: los ataques sobre su zona pasan de ${d.from} a ${d.to}.`, contrast: null };
    case "castling":
      return you
        ? { cause: `En la línea principal te quedas sin poder enrocar y con el rey en el centro.`, contrast: c(d.bestHadIt ? "enrocabas." : "conservabas el enroque.") }
        : { cause: `El rival se queda sin poder enrocar y con el rey en el centro.`, contrast: null };
    case "shield":
      return you
        ? { cause: `En la línea principal se debilita la cobertura de tu rey: te quedan ${d.to} peones delante, frente a ${d.from}.`, contrast: c("la mantenías.") }
        : { cause: `Se debilita la cobertura del rey rival: le quedan ${d.to} peones delante, frente a ${d.from}.`, contrast: null };
    case "doubled":
      return you
        ? { cause: `En la línea principal te quedan peones doblados en la columna ${d.file}.`, contrast: c("lo evitabas.") }
        : { cause: `Al rival le quedan peones doblados en la columna ${d.file}.`, contrast: null };
    case "isolated":
      return you
        ? { cause: `En la línea principal tu peón de ${d.square} queda aislado.`, contrast: c("lo evitabas.") }
        : { cause: `El peón rival de ${d.square} queda aislado.`, contrast: null };
    case "passive":
      return you
        ? { cause: d.reason === "badSquare"
            ? `En la línea principal ${art(d.piece!)} de ${d.square} queda mal colocado, con poca influencia.`
            : `En la línea principal ${art(d.piece!)} de ${d.square} queda encerrado, casi sin casillas.`,
            contrast: c(d.reason === "badSquare" ? "estaba mejor colocado." : "no quedaba encerrado.") }
        : { cause: d.reason === "badSquare"
            ? `${cap(art(d.piece!))} del rival en ${d.square} queda mal colocado, con poca influencia.`
            : `${cap(art(d.piece!))} del rival en ${d.square} queda encerrado, casi sin casillas.`, contrast: null };
    case "mobility":
      return you
        ? { cause: `En la línea principal tus piezas quedan bastante menos activas que con la mejor jugada.`, contrast: null }
        : { cause: `Las piezas del rival quedan bastante menos activas.`, contrast: null };
    case "development":
      return you
        ? { cause: `En la línea principal te quedas con ${d.from! - d.to!} piezas menores menos desarrolladas.`, contrast: c("las sacabas antes.") }
        : { cause: `El rival se retrasa en el desarrollo: ${d.from! - d.to!} piezas menores menos en juego.`, contrast: null };
  }
}

/**
 * Compares two positions that are comparable: same material, so that what differs is the shape
 * of the position and not what was won. Returns the strongest difference, or null.
 */
export function compareEndpoints(playedFen: string, bestFen: string, me: Color, minScore = MIN_SCORE): Difference | null {
  let p: Profile, b: Profile;
  try { p = profile(playedFen, me); b = profile(bestFen, me); } catch { return null; }
  // Material that differs — even by a pawn — is the material story's business, not this one's:
  // the shape of two positions is only comparable when what each side owns is the same.
  if (Math.abs(p.material - b.material) >= 1) return null;
  return differences(p, b, minScore)[0] ?? null;
}
