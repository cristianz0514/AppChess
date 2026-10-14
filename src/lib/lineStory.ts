// What a move leads to over the NEXT two or three plies, told as cause and effect.
//
// The template coach (coachComment.ts) describes the move that was played: its shape, its
// square, the opening it belongs to. That is what made its comments read as "hablan solo de
// la jugada actual". The reason a move is an error is almost never in the move — it is in
// the reply, and in the reply to the reply. "Con Be3 permites Ng4" is a comment;
// "Be3" is a description.
//
// This module reads the principal variation the engine already returned (nothing extra is
// searched for it), replays it through chess.js, and reports what the line is actually
// about: a mate, a named tactic, a piece that falls and WHY it falls (it was left without a
// defender, a threat was ignored, a line was opened…), and what the better move did
// instead.
//
// Design rule, the same one the rest of the coach lives by: every claim is VERIFIED against
// a replayed line or the board, and when verification fails the module stays silent and the
// caller falls back to the descriptive rules. A comment that says too little is a smaller
// defect than one that says something false.
//
// Pure: chess.js plus the repo's own geometry helpers. No engine, no database, no clock.

import { Chess, type Move } from "chess.js";
import { attacksFrom, attackersOf, buildAttackMap, PIECE_VALUE, type Color } from "./attackMap";

const MATE_MAG = 90;           // |eval| at/above this is a mate score, not a pawn count
const MATE_MAX_MOVES = 4;      // past this the distance is not worth quoting (see coachComment)

// ── Spanish helpers ───────────────────────────────────────────────────────────

const NAME: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const FEM = new Set(["r", "q"]);
/** "del alfil" / "de la dama": Spanish contracts de + el, and "de el alfil" reads as a template. */
const deArt = (t: string) => (FEM.has(t) ? `de la ${NAME[t]}` : `del ${NAME[t] ?? "pieza"}`);
const art = (t: string) => `${FEM.has(t) ? "la" : "el"} ${NAME[t] ?? "pieza"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Object pronoun that agrees with the piece: "se la lleva" (dama) / "se lo lleva" (caballo). */
const clit = (t: string) => (FEM.has(t) ? "la" : "lo");
/** "atacado" / "atacada". */
const ado = (t: string) => (FEM.has(t) ? "a" : "o");
const oppOf = (c: Color): Color => (c === "w" ? "b" : "w");
const val = (t: string | null | undefined) => (t ? PIECE_VALUE[t] ?? 0 : 0);

/**
 * How much material a swing is, in words. Pawn counts are engine jargon (the rest of the
 * coach avoids them on purpose), so the number is turned into what a player would say.
 * `biggest` is the most valuable piece that actually changed hands, which lets a swing of
 * 5 read "una torre" when it was one and "más de una pieza" when it was a pawn-and-pieces
 * mix.
 */
export function worth(pawns: number, biggest: string | null = null): string {
  if (pawns >= 8) return biggest === "q" ? "la dama" : "muchísimo material";
  if (pawns >= 4.5) return biggest === "r" ? "una torre" : "más de una pieza";
  if (pawns >= 2.5) return "una pieza";
  if (pawns >= 1.5) return "material";
  return "un peón";
}

// ── Replaying a line ──────────────────────────────────────────────────────────

export interface Ev {
  idx: number;
  color: Color;
  san: string;
  piece: string;               // p n b r q k
  from: string;
  to: string;
  captured: string | null;
  capSquare: string | null;    // where the captured piece stood (differs from `to` en passant)
  promotion: string | null;
  check: boolean;
  mate: boolean;
  fenBefore: string;
  fenAfter: string;
}

/** Replays `sans` from `fen`, stopping at the first move that does not fit. */
export function replay(fen: string, sans: readonly string[], maxPlies = 8): Ev[] {
  let board: Chess;
  try { board = new Chess(fen); } catch { return []; }
  const out: Ev[] = [];
  for (const san of sans.slice(0, maxPlies)) {
    const before = board.fen();
    let mv: Move | null = null;
    try { mv = board.move(san); } catch { mv = null; }
    if (!mv) break;
    out.push({
      idx: out.length, color: mv.color as Color, san: mv.san, piece: mv.piece,
      from: mv.from, to: mv.to,
      captured: mv.captured ?? null,
      capSquare: mv.captured ? (mv.flags.includes("e") ? `${mv.to[0]}${mv.from[1]}` : mv.to) : null,
      promotion: mv.promotion ?? null,
      check: /[+#]/.test(mv.san), mate: mv.san.includes("#"),
      fenBefore: before, fenAfter: board.fen(),
    });
    if (board.isGameOver()) break;
  }
  return out;
}

// ── Material ──────────────────────────────────────────────────────────────────

function balance(board: Chess, me: Color): number {
  let sum = 0;
  for (const row of board.board()) for (const c of row) if (c) sum += val(c.type) * (c.color === me ? 1 : -1);
  return sum;
}

/**
 * Material from `me`'s side once every capture has played out — a capture-only quiescence
 * search with stand-pat. A PV is cut off wherever the engine's depth ran out, often in the
 * middle of an exchange, so reading the board at its last ply would count a capture whose
 * recapture sits just outside the window. Letting the captures finish is what makes
 * "pierdes una pieza" mean the exchange settled, not that the line stopped.
 */
export function settledBalance(fen: string, me: Color, maxDepth = 6): number {
  let root: Chess;
  try { root = new Chess(fen); } catch { return 0; }
  const search = (b: Chess, alpha: number, beta: number, d: number): number => {
    const stand = balance(b, me);
    if (d === 0) return stand;
    const maxing = b.turn() === me;
    let best = stand;
    if (maxing) { if (best >= beta) return best; alpha = Math.max(alpha, best); }
    else { if (best <= alpha) return best; beta = Math.min(beta, best); }
    const caps = b.moves({ verbose: true }).filter((m) => m.captured)
      .sort((a, c) => (val(c.captured) - val(a.captured)) || (val(a.piece) - val(c.piece)));
    for (const m of caps) {
      b.move(m.san);
      const score = search(b, alpha, beta, d - 1);
      b.undo();
      if (maxing) { if (score > best) best = score; alpha = Math.max(alpha, best); }
      else { if (score < best) best = score; beta = Math.min(beta, best); }
      if (alpha >= beta) break;
    }
    return best;
  };
  try { return search(root, -1e9, 1e9, maxDepth); } catch { return balance(root, me); }
}

/** Material `me` gains (+) or loses (−) over the line, once the exchanges settle. */
export function lineNet(startFen: string, events: readonly Ev[], me: Color): number {
  if (events.length === 0) return 0;
  let start: Chess;
  try { start = new Chess(startFen); } catch { return 0; }
  return settledBalance(events[events.length - 1].fenAfter, me) - balance(start, me);
}

/** The most valuable piece `by` captures in the line, or null. */
function biggestTaken(events: readonly Ev[], by: Color): string | null {
  let best: string | null = null;
  for (const e of events) if (e.color === by && e.captured && val(e.captured) > val(best)) best = e.captured;
  return best;
}

// ── Tactics, read off the actual position ─────────────────────────────────────

export interface Target { piece: string; square: string }

/**
 * Pieces the moved piece attacks after `ev`, for a fork: two or more enemy pieces worth a
 * knight or more, the KING counted as a target. tacticalMotifs' own fork test skips the
 * king (its value is 0 in the material table), so a knight forking king and rook was
 * invisible to it — the single most common fork there is.
 */
export function forkTargets(ev: Ev): Target[] | null {
  let board: Chess;
  try { board = new Chess(ev.fenAfter); } catch { return null; }
  const at = (s: string) => {
    const p = board.get(s as never) as { type: string; color: Color } | undefined;
    return p ? { type: p.type, color: p.color } : null;
  };
  const targets: Target[] = [];
  for (const sq of attacksFrom(ev.promotion ?? ev.piece, ev.color, ev.to, at)) {
    const p = at(sq);
    if (p && p.color !== ev.color && (p.type === "k" || val(p.type) >= 3)) targets.push({ piece: p.type, square: sq });
  }
  if (targets.length < 2) return null;
  // The king first (it is the check), then by value.
  targets.sort((a, b) => (a.piece === "k" ? -1 : b.piece === "k" ? 1 : val(b.piece) - val(a.piece)));
  return targets.slice(0, 2);
}

/** The piece that gives check when it is NOT the piece that just moved: a discovered check. */
function discoveredChecker(ev: Ev): string | null {
  if (!ev.check) return null;
  let board: Chess;
  try { board = new Chess(ev.fenAfter); } catch { return null; }
  const map = buildAttackMap(ev.fenAfter);
  const king = board.board().flat().find((c) => c && c.type === "k" && c.color === oppOf(ev.color));
  if (!king) return null;
  const checkers = attackersOf(map, king.square, ev.color);
  if (checkers.length === 0) return null;
  if (checkers.some((a) => a.from === ev.to)) return null;     // the mover itself checks
  return NAME[checkers[0].type] ? checkers[0].type : null;
}

type Tactic =
  | { key: "fork"; targets: Target[]; check: boolean }
  | { key: "discovered"; checker: string };

/** A tactic the move at `ev` creates. NOT yet verified against the line — see `tacticPays`. */
function tacticOf(ev: Ev): Tactic | null {
  const fork = forkTargets(ev);
  if (fork) return { key: "fork", targets: fork, check: fork.some((t) => t.piece === "k") };
  const disc = discoveredChecker(ev);
  if (disc) return { key: "discovered", checker: disc };
  // Pins and skewers are deliberately NOT named here. Their geometry is easy to detect and
  // hard to tie to a result: a bishop "pinning" a knight is on the board in a thousand
  // positions where nothing falls, and the line's capture is rarely on the pinned piece.
  // The descriptive rules still name them when the geometry alone is what is being shown.
  return null;
}

/**
 * A tactic only gets named if the line then COLLECTS on it: the side that played it takes a
 * piece (knight or better) within its next two moves, and the line nets at least two pawns.
 * Geometry alone over-fires — a "fork" the other side simply captures is not a fork — so the
 * name is earned by the result.
 */
function tacticPays(L: readonly Ev[], k: number, net: number): boolean {
  if (net < 2) return false;
  const color = L[k].color;
  for (let j = k + 1; j <= k + 4 && j < L.length; j++) {
    if (L[j].color === color && L[j].captured && val(L[j].captured) >= 3) return true;
    if (L[j].color === color && L[j].mate) return true;
  }
  return false;
}

// ── Why a piece falls ─────────────────────────────────────────────────────────

type Cause = "undefended" | "tradedDown" | "unguard" | "ignored" | "opened" | "other";

/**
 * Why the capture at L[1] was possible, answered from the attack tables of the position
 * before and after the played move L[0]:
 *   - the moved piece itself was taken, with / without a defender,
 *   - a piece LOST its only defender when the moved piece left (unguard),
 *   - the piece was already attacked and the move did nothing about it (ignored),
 *   - the move opened a line for a slider (opened).
 */
function causeOf(L: readonly Ev[]): Cause {
  const M = L[0], r = L[1];
  const mover = M.color, opp = oppOf(mover);
  if (!r.captured) return "other";
  const S = r.capSquare ?? r.to;
  const mapBefore = buildAttackMap(M.fenBefore);
  const mapAfter = buildAttackMap(M.fenAfter);

  if (S === M.to) {
    return attackersOf(mapAfter, S, mover).length === 0 ? "undefended" : "tradedDown";
  }
  const attackedBefore = attackersOf(mapBefore, S, opp).some((a) => a.from === r.from);
  const defBefore = attackersOf(mapBefore, S, mover).map((a) => a.from);
  const defAfter = attackersOf(mapAfter, S, mover).map((a) => a.from === M.from ? M.to : a.from);
  if (attackedBefore) {
    if (defBefore.includes(M.from) && !defAfter.includes(M.to) && defAfter.length < defBefore.length) return "unguard";
    if (defAfter.length <= defBefore.length) return "ignored";
    return "other";
  }
  // Not attacked before: a slider whose ray the move uncovered.
  if (["b", "r", "q"].includes(r.piece)) {
    const attackedNow = attackersOf(mapAfter, S, opp).some((a) => a.from === r.from);
    if (attackedNow) return "opened";
  }
  return "other";
}

// ── The story ─────────────────────────────────────────────────────────────────

export interface StoryInput {
  fenBefore: string;
  playedSan: string;
  /** Who made the move. */
  mover: Color;
  /** The move belongs to the OPPONENT of the player the comment is addressed to. */
  byOpponent: boolean;
  /** Engine line from the position AFTER the move (SAN, starting with the reply). */
  reply: readonly string[];
  /** Engine best line from the position BEFORE the move (SAN, starting with the best move). */
  best: readonly string[];
  /** Mover's perspective, pawns (mate ≈ ±10000). */
  evalBefore: number;
  evalAfter: number;
  classification: string | null;
  /** brilliant / great / a best move that punished the previous error. */
  good: boolean;
}

export type StoryKind =
  | "mate" | "fork" | "discovered"
  | "undefended" | "tradedDown" | "unguard" | "ignored" | "opened"
  | "check" | "quiet" | "capture" | "wins" | "sacrifice" | "missedWin" | "none";

export interface Story {
  kind: StoryKind;
  /** What the move allows (an error) — in the voice of whoever the comment addresses. */
  allows: string | null;
  /** What the better move did (the player's own error only). */
  better: string | null;
  /** What the move wins (a good move by the player). */
  achieves: string | null;
  /** Material the mover gains (+) or loses (−) over the engine's line, once settled. */
  net: number | null;
  /** The engine's best reply TAKES the piece that just moved, and that piece is worth more than
   *  what the move captured: an actual sacrifice, not merely a square the piece could be taken on. */
  sacrifice: boolean;
  /** On the rival's error: what the player could have done, in the past tense and without a
   *  subject ("con el caballo a d6 te llevabas el peón de a4"), for the NEXT comment to say
   *  when the player did not take it. */
  missed: string | null;
}


const clean = (san: string) => san.replace(/[+#?!]/g, "");

const targetPhrase = (t: Target) => `${art(t.piece)} de ${t.square}`;

/** How far down the engine's line the material is counted. The comment narrates the first few
 *  plies, but the verdict ("pierdes una torre") has to see the whole exchange — a PV often
 *  collects the piece nine plies in, and a short window reported such lines as harmless. */
const WINDOW = 12;

type Mode = "rival" | "rivalPast" | "you" | "youPast";

/**
 * The fork as a verb phrase, in the right person and tense. With a check the king is not
 * "attacked", it is checked, and the other target is attacked ALONGSIDE: "da jaque y ataca
 * también el alfil de e3" — the old "ataca el rey y el alfil de e3" misdescribed a check.
 */
function forkClause(t: { targets: Target[]; check: boolean }, mode: Mode): string {
  const v = mode === "rival" ? { chk: "da jaque", atk: "ataca" }
    : mode === "rivalPast" ? { chk: "daba jaque", atk: "atacaba" }
    : mode === "you" ? { chk: "das jaque", atk: "atacas" }
    : { chk: "dabas jaque", atk: "atacabas" };
  if (t.check) {
    const other = t.targets.find((x) => x.piece !== "k");
    if (other) return `${v.chk} y ${v.atk} también ${targetPhrase(other)}`;
  }
  const one = (x: Target) => targetPhrase(x);
  return `${v.atk} ${one(t.targets[0])} y ${one(t.targets[1])} a la vez`;
}

/** "una clase de" for the headline: a fork that includes a check is named so. */
const forkName = (t: { check: boolean }) => (t.check ? "un doble con jaque" : "un doble");

/**
 * Builds the story of one move from the engine lines around it. Returns null when there is
 * nothing verified worth telling, so the caller keeps its descriptive comment.
 */
export function buildStory(inp: StoryInput): Story | null {
  const L = replay(inp.fenBefore, [inp.playedSan, ...inp.reply], WINDOW);
  if (L.length === 0 || clean(L[0].san) !== clean(inp.playedSan)) return null;
  const isError = inp.classification === "inaccuracy" || inp.classification === "mistake" || inp.classification === "blunder";

  const story: Story = { kind: "none", allows: null, better: null, achieves: null, net: null, sacrifice: false, missed: null };
  if (L.length >= 2) {
    story.net = lineNet(inp.fenBefore, L, inp.mover);
    const M = L[0], r1 = L[1];
    story.sacrifice = !!r1.captured && r1.capSquare === M.to && val(M.piece) > val(M.captured) + 0.5;
  }

  if (isError) {
    const a = allowsStory(L, inp, story.net);
    if (a) {
      story.allows = a.text; story.kind = a.kind;
      if (inp.byOpponent) story.missed = missedPhrase(L, a.kind, story.net);
    }
    // On the player's own move: what the better move did. On the rival's: what the rival
    // MISSED — told only when nothing was allowed, since "allows" is already the player's
    // opportunity read off the same line.
    const b = betterStory(inp, story.net, biggestTaken(L.slice(1), oppOf(inp.mover)));
    story.better = b?.text ?? null;
    // When the consequence already names what is lost, the better move only has to say it avoids it.
    if (b?.avoids && story.allows) story.better = b.text.replace(/ evitabas perder .*$/, ' lo evitabas.');
    // A weak consequence ("tras X el rival acaba llevándose un peón") beside a much bigger
    // missed win is a red herring: the real error is the move that was not played. Say that.
    if (b && b.gain >= 3 && (story.kind === "quiet" || story.kind === "check")) { story.allows = null; story.kind = "missedWin"; }
  } else if (inp.good && !inp.byOpponent) {
    const w = achievesStory(L, inp, story.net);
    if (w) { story.achieves = w.text; story.kind = w.kind; }
  }
  return story;
}

/**
 * What the player could have done about the rival's error, as a past-tense phrase with no
 * subject — the next comment finishes "Se te escapó: …" with it when the player played
 * something else. Rebuilt from the same replayed line as the "allows" sentence.
 */
function missedPhrase(L: readonly Ev[], kind: StoryKind, net: number | null): string | null {
  if (L.length < 2 || net == null) return null;
  const M = L[0], r1 = L[1];
  const replier = oppOf(M.color);
  const gain = net * -1;                                   // what the replier (the player) wins
  const word = worth(gain, biggestTaken(L.slice(1), replier));
  if (kind === "mate") {
    const n = L.filter((e) => e.color === replier).length;
    return n === 1 ? "tenías mate en una jugada" : `tenías mate en ${n}`;
  }
  if (kind === "fork" || kind === "discovered") {
    for (const k of [1, 3]) {
      const ev = L[k];
      if (!ev || ev.color !== replier) continue;
      const t = tacticOf(ev);
      if (!t) continue;
      return t.key === "fork"
        ? `con ${art(ev.piece)} a ${ev.to} ${forkClause(t, "youPast")}, y ganabas ${word}`
        : `con ${art(ev.piece)} a ${ev.to} dabas jaque a la descubierta y ganabas ${word}`;
    }
    return null;
  }
  if (r1.captured && ["undefended", "tradedDown", "unguard", "ignored", "opened", "capture"].includes(kind)) {
    const P = r1.captured;
    return `con ${art(r1.piece)} a ${r1.to} te llevabas ${art(P)}${gain >= val(P) + 1.5 ? ` y ganabas ${word}` : ""}`;
  }
  const win = L.find((e, k) => k >= 2 && e.color === replier && e.captured && val(e.captured) >= 1);
  if (win && (kind === "check" || kind === "quiet")) {
    const tail = `${art(win.captured!)} de ${win.capSquare ?? win.to}`;
    return kind === "check"
      ? `con jaque ${deArt(r1.piece)} en ${r1.to} acababas llevándote ${tail}`
      : `con ${art(r1.piece)} a ${r1.to} acababas llevándote ${tail}`;
  }
  return null;
}

// ── An error: what it allows ──────────────────────────────────────────────────

function allowsStory(
  L: readonly Ev[], inp: StoryInput, net: number | null,
): { text: string; kind: StoryKind } | null {
  if (L.length < 2 || net == null) return null;
  const M = L[0], r1 = L[1];
  const opp = oppOf(M.color);
  const you = !inp.byOpponent;            // the mover is the player: second person
  const last = L[L.length - 1];

  // ── Mate ────────────────────────────────────────────────────────────────────
  // A principal variation that ENDS in checkmate is the engine proving the mate — both sides
  // play their best in it — so the line is the evidence and no score needs to corroborate it.
  if (last.mate && last.color === opp) {
    const n = L.filter((e) => e.color === opp).length;
    const first = r1.mate ? null
      : r1.check ? `empieza con jaque ${deArt(r1.piece)} en ${r1.to}`
      : r1.captured ? `empieza llevándose ${art(r1.captured)} de ${r1.to}`
      : `empieza con ${art(r1.piece)} a ${r1.to}`;
    if (n === 1) {
      return { kind: "mate", text: you
        ? `Esta jugada permite jaque mate: ${art(last.piece)} del rival remata en ${last.to}.`
        : `El rival permite jaque mate: ${art(last.piece)} remata en ${last.to}.` };
    }
    if (n <= MATE_MAX_MOVES && first) {
      return { kind: "mate", text: you
        ? `Esta jugada permite mate forzado en ${n}: el rival ${first}.`
        : `El rival permite mate forzado en ${n}: tú ${first.replace(/^empieza/, "empiezas")}.` };
    }
    return { kind: "mate", text: you ? `Esta jugada permite un mate forzado.` : `El rival permite un mate forzado.` };
  }

  // ── Material ────────────────────────────────────────────────────────────────
  const lost = -net;
  if (lost < 1) return null;
  const drop = inp.evalBefore - inp.evalAfter;
  const onPawnScale = Math.abs(inp.evalBefore) < MATE_MAG && Math.abs(inp.evalAfter) < MATE_MAG;
  // Two independent measurements have to agree: the replayed line says WHAT falls, the
  // evaluation says HOW MUCH the position actually cost.
  if (onPawnScale && drop < lost * 0.4) return null;

  const gone = biggestTaken(L.slice(1), opp);
  const word = worth(lost, gone);
  const rv = r1.piece;   // the replier's piece

  // A named tactic, earned by the result. Checked on the reply, and on the move after the
  // player's forced answer, since a fork often comes one ply later.
  for (const k of [1, 3]) {
    const ev = L[k];
    if (!ev || ev.color !== opp) continue;
    const t = tacticOf(ev);
    if (!t || !tacticPays(L, k, lost)) continue;
    if (t.key === "fork") {
      return { kind: "fork", text: you
        ? `Permites ${forkName(t)}: ${art(ev.piece)} del rival llega a ${ev.to}${t.check ? "," : " y"} ${forkClause(t, "rival")}. Acabas perdiendo ${word}.`
        : `El rival permite ${forkName(t)}: con ${art(ev.piece)} a ${ev.to} ${forkClause(t, "you")}, y ganas ${word}.` };
    }
    return { kind: "discovered", text: you
      ? `Permites un jaque a la descubierta: al mover ${art(ev.piece)} a ${ev.to}, ${art(t.checker)} del rival da jaque y acabas perdiendo ${word}.`
      : `El rival permite un jaque a la descubierta: al mover ${art(ev.piece)} a ${ev.to}, ${art(t.checker)} da jaque y ganas ${word}.` };
  }

  // The reply is a capture: say why it was possible.
  if (r1.captured) {
    const P = r1.captured, S = r1.capSquare ?? r1.to;
    const cause = causeOf(L);
    const mp = M.piece;
    // The verdict sentence is added only when the total says more than the capture did.
    const verdict = lost >= val(P) + 1.5 ? ` En total, ${you ? "pierdes" : "ganas"} ${word}.` : "";
    switch (cause) {
      case "undefended":
        return { kind: "undefended", text: you
          ? `${cap(art(mp))} en ${S} queda sin defensa y ${art(rv)} del rival se ${clit(mp)} lleva.${verdict}`
          : `El rival deja ${art(mp)} en ${S} sin defensa: te ${clit(mp)} llevas con ${art(rv)}.${verdict}` };
      case "tradedDown":
        return { kind: "tradedDown", text: you
          ? `${cap(art(rv))} del rival captura ${art(mp)} en ${S} y, aunque recuperes, el cambio te cuesta ${word}.`
          : `Capturas ${art(mp)} en ${S} con ${art(rv)} y, aunque el rival recupere, el cambio te favorece: ganas ${word}.` };
      case "unguard":
        return { kind: "unguard", text: you
          ? `Al mover ${art(mp)} dejas sin defensa ${art(P)} de ${S}, y ${art(rv)} del rival se ${clit(P)} lleva.${verdict}`
          : `Al mover ${art(mp)}, el rival deja sin defensa ${art(P)} de ${S}: te ${clit(P)} llevas con ${art(rv)}.${verdict}` };
      case "ignored":
        return { kind: "ignored", text: you
          ? `${cap(art(P))} de ${S} ya estaba atacad${ado(P)} y no lo atendiste: ${art(rv)} del rival se ${clit(P)} lleva.${verdict}`
          : `El rival no atiende tu amenaza sobre ${art(P)} de ${S}: te ${clit(P)} llevas con ${art(rv)}.${verdict}` };
      case "opened":
        return { kind: "opened", text: you
          ? `Al mover ${art(mp)} abres la línea de ${art(rv)} rival, y cae ${art(P)} de ${S}.${verdict}`
          : `Al mover ${art(mp)} el rival abre una línea a tu ${NAME[rv]}: te llevas ${art(P)} de ${S}.${verdict}` };
      default:
        return { kind: "capture", text: you
          ? `${cap(art(rv))} del rival se lleva ${art(P)} de ${S}.${lost >= 2 ? ` En total, pierdes ${word}.` : ""}`
          : `Te llevas ${art(P)} de ${S} con ${art(rv)}.${lost >= 2 ? ` En total, ganas ${word}.` : ""}` };
    }
  }

  // The reply is not a capture: a check, or a quiet move whose point shows up later. Said as
  // a SEQUENCE ("tras X, acaba llevándose Y") — what the line shows — rather than as a claim
  // about why nothing can be done, which the line does not show.
  const win = L.find((e, k) => k >= 2 && e.color === opp && e.captured && val(e.captured) >= 1);
  if (!win) return null;
  const tail = `${art(win.captured!)} de ${win.capSquare ?? win.to}`;
  // "acaba llevándose la torre: pierdes un peón" contradicts itself when the line also wins
  // something back. The verdict is added only when the net really is about what was taken.
  const settles = lost >= val(win.captured) - 0.5;
  if (r1.check) {
    return { kind: "check", text: you
      ? `El rival responde con jaque ${deArt(rv)} en ${r1.to} y acaba llevándose ${tail}.`
      : `Empiezas con jaque ${deArt(rv)} en ${r1.to} y acabas llevándote ${tail}.` };
  }
  return { kind: "quiet", text: you
    ? `Tras ${art(rv)} del rival a ${r1.to}, acaba llevándose ${tail}${settles ? `: pierdes ${word}` : ""}.`
    : `Con ${art(rv)} a ${r1.to} acabas llevándote ${tail}${settles ? `: ganas ${word}` : ""}.` };
}

// ── An error: what the better move did ────────────────────────────────────────

/**
 * On the player's own move: what the better move did ("Con la dama a d4 ganabas…"). On the
 * rival's move: what the RIVAL missed ("Se le escapó al rival: …") — information the player
 * can use, because it is the thing to watch for when the same position comes with the
 * colours reversed. Same verified line either way; only the person changes.
 */
function betterStory(
  inp: StoryInput, playedNet: number | null, playedLostBiggest: string | null,
): { text: string; gain: number; avoids?: boolean } | null {
  const B = replay(inp.fenBefore, inp.best, WINDOW);
  if (B.length === 0 || clean(B[0].san) === clean(inp.playedSan)) return null;
  const b1 = B[0];
  const me = inp.mover;
  const rival = inp.byOpponent;
  const lead = rival ? `Se le escapó al rival: con ${art(b1.piece)} a ${b1.to}` : `Con ${art(b1.piece)} a ${b1.to}`;

  // A mate that was there.
  const last = B[B.length - 1];
  if (last.mate && last.color === me) {
    const n = B.filter((e) => e.color === me).length;
    if (n > MATE_MAX_MOVES) return null;
    const mateText = rival
      ? (n === 1 ? `Al rival se le escapó un mate en una jugada.` : `Al rival se le escapó un mate en ${n}.`)
      : (n === 1 ? `Había mate en una: ${art(b1.piece)} a ${b1.to}.` : `Con ${art(b1.piece)} a ${b1.to} tenías mate en ${n}.`);
    return { text: mateText, gain: 99 };
  }

  const bestNet = lineNet(inp.fenBefore, B, me);
  const over = playedNet == null ? bestNet : bestNet - playedNet;
  if (over < 2) return null;

  const gone = biggestTaken(B, oppOf(me));
  // What the best line collects, beyond its own first move.
  const later = B.find((e, k) => k >= 2 && e.color === me && e.captured && val(e.captured) >= 1);

  if (bestNet >= 1.5) {
    const word = worth(bestNet, gone);
    if (b1.captured && val(b1.captured) >= 1) {
      const tail = later
        ? `, y después ${rival ? "se llevaba" : "te llevabas"} ${art(later.captured!)} de ${later.capSquare ?? later.to}` : "";
      return { text: `${lead} ${rival ? "se llevaba" : "te llevabas"} ${art(b1.captured)}${tail}.`, gain: bestNet };
    }
    const t = tacticOf(b1);
    if (t && t.key === "fork" && tacticPays(B, 0, bestNet)) {
      return { text: `${lead} ${forkClause(t, rival ? "rivalPast" : "youPast")}, y ${rival ? "ganaba" : "ganabas"} ${word}.`, gain: bestNet };
    }
    if (later) {
      // The capture is quoted as the example only when it is a real part of the total: "ganando
      // más de una pieza: el peón de d5 caía" made the example contradict the sum.
      const example = val(later.captured) >= 3 || val(later.captured) >= bestNet * 0.5
        ? `: ${art(later.captured!)} de ${later.capSquare ?? later.to} caía` : "";
      return { text: `${lead} ${rival ? "acababa" : "acababas"} ganando ${word}${example}.`, gain: bestNet };
    }
    return null;
  }

  // The better move did not win anything — it avoided a loss (the player's own move only).
  if (!rival && playedNet != null && playedNet <= -1.5) {
    return { text: `Con ${art(b1.piece)} a ${b1.to} evitabas perder ${worth(-playedNet, playedLostBiggest)}.`, gain: over, avoids: true };
  }
  return null;
}

// ── A good move: what it wins ─────────────────────────────────────────────────

function achievesStory(
  L: readonly Ev[], inp: StoryInput, net: number | null,
): { text: string; kind: StoryKind } | null {
  if (L.length < 2 || net == null || net < 2) return null;
  const M = L[0], r1 = L[1];
  // A plain win of material already says itself ("Ganas el alfil"); the story adds value only
  // when the gain comes LATER than the move.
  if (M.captured && val(M.captured) >= net - 0.5) return null;
  const gone = biggestTaken(L, M.color);
  const word = worth(net, gone);

  const t = tacticOf(M);
  if (t && t.key === "fork" && tacticPays(L, 0, net)) {
    return { kind: "fork", text: `Con ${art(M.piece)} a ${M.to} ${forkClause(t, "you")}: el rival no puede evitar perder ${word}.` };
  }
  if (t && t.key === "discovered" && tacticPays(L, 0, net)) {
    return { kind: "discovered", text: `Jaque a la descubierta: al mover ${art(M.piece)} a ${M.to}, ${art(t.checker)} da jaque y ganas ${word}.` };
  }
  const win = L.find((e, k) => k >= 2 && e.color === M.color && e.captured && val(e.captured) >= 1);
  if (!win) return null;
  const tail = `${art(win.captured!)} de ${win.capSquare ?? win.to}`;
  if (r1.captured && r1.to === M.to && val(r1.captured) > val(M.captured)) {
    return { kind: "sacrifice", text: `Entregas ${art(M.piece)} en ${M.to}, pero si lo toman ${art(win.piece)} se lleva ${tail} y ganas ${word}.` };
  }
  return { kind: "wins", text: `Con ${art(M.piece)} a ${M.to} el rival ya no puede evitar perder ${word}: ${tail} caerá.` };
}
