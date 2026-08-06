// Freeze the MoveFacts of real games as JSON, for the verification harness.
//
//   node --experimental-strip-types --import ./scripts/lib/register.mjs \
//        --env-file=.env.local scripts/captureFixtures.mts [n]
//
// WHY THIS EXISTS
//
// composeCoachComment is a pure function of MoveFacts, and MoveFacts is entirely
// JSON-serialisable. So "replay eight real games through the comment engine" reduces
// to "replay captured facts" — no Stockfish, no browser, no database in the loop that
// verifies a refactor. That is what makes a byte-for-byte A/B diff cheap enough to run
// on every change (see scripts/diffComments.cjs).
//
// The facts are rebuilt with blunderDetector's OWN builders, not re-implemented here.
// A re-implementation would validate the harness instead of the product; this has been
// the single most useful discipline in this project's measurements.
//
// It reads each ply's STORED `evaluation` and `classification` from the database
// rather than assuming them. That matters: an earlier throwaway harness pinned the
// eval to 0 for every ply, which silently disabled band()/standing/state and the whole
// error tier, so it could not have caught a defect in any of them.
//
// What is NOT captured: the engine tier's facts (bestPiece, bestTo, playedMotifs from a
// deep search, punishFollowUp, opportunity). Those come from searches this script does
// not run, so they are left at their no-engine values — exactly as pass 4 of the real
// analysis leaves them. Coverage of the engine-tier branches is the job of
// fixtures/coach/synthetic.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { Chess } from "chess.js";
import { isBookPosition } from "@/lib/openingBook";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { openingFamily } from "@/lib/translateOpening";
import {
  PIECE_ES, tradeVerdictFor, trappedPieceAfter, backRankBoxedIn,
  positionalFlags, endgameFlags, boardReadingFacts, materialAfterDust,
} from "@/services/blunderDetector";
import type { MoveFacts } from "@/lib/coachComment";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("faltan NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY (usa --env-file=.env.local)");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: "Bearer " + KEY };
const OUT = new URL("./fixtures/coach/", import.meta.url);
const WANTED = Number(process.argv[2] ?? 8);

async function api(path: string) {
  const r = await fetch(URL_ + path, { headers: H });
  if (!r.ok) throw new Error(path + " -> " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error("respuesta no es array: " + JSON.stringify(j).slice(0, 200));
  return j;
}

// Scoped to one user's games. Filtering the whole table on `accuracy=not.is.null`
// times the database out (57014) — there are ~38k games and no index for it, while
// user_id is indexed.
//
//   node … scripts/captureFixtures.mts 8 cristianz05
const wantedUser = process.argv[3];
const users = await api("/rest/v1/users?select=id,chess_username&limit=50");
const user = wantedUser
  ? users.find((u: any) => u.chess_username === wantedUser)
  : users[0];
if (!user) { console.error("usuario no encontrado:", wantedUser); process.exit(1); }
console.log(`capturando de ${user.chess_username}`);

// Newest first, then filtered for analysed ones in the loop below — a wider net than
// `limit=WANTED` on purpose, because games whose move rows predate the `ply` migration
// get skipped and would otherwise leave the fixture set short.
const games = await api(
  "/rest/v1/games?select=id,pgn,played_as,opening,accuracy" +
  "&user_id=eq." + user.id + "&accuracy=not.is.null&order=created_at.desc&limit=60",
);

mkdirSync(OUT, { recursive: true });
let written = 0;
const summary: string[] = [];

for (const g of games) {
  if (written >= WANTED) break;
  if (!g.pgn) continue;

  const stored = await api(
    "/rest/v1/moves?select=ply,move,classification,evaluation,centipawn_loss" +
    "&game_id=eq." + g.id + "&order=ply.asc&limit=400",
  );
  // Rows without `ply` predate that migration and cannot be attributed to a move.
  const byPly = new Map<number, any>();
  for (const m of stored) if (typeof m.ply === "number") byPly.set(m.ply, m);
  if (byPly.size === 0) continue;

  const chess = new Chess();
  try { chess.loadPgn(g.pgn); } catch { continue; }
  const history = chess.history({ verbose: true });
  chess.reset();
  const fens: string[] = [];
  for (const m of history) { chess.move(m.san); fens.push(chess.fen()); }
  if (fens.length < 10) continue;

  const bookPly = fens.map((f) => isBookPosition(f));
  const lastBookPly = bookPly.lastIndexOf(true);
  const openingName = openingFamily(g.opening);
  const playerIsWhite = g.played_as !== "black";

  const facts: MoveFacts[] = [];
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const row = byPly.get(i);
    if (!row) continue;
    const fenBefore = i === 0 ? new Chess().fen() : fens[i - 1];
    const moverWhite = i % 2 === 0;
    const byOpponent = (i % 2 === 0) !== playerIsWhite;

    // Stored evaluation is from WHITE's perspective; both slots want the MOVER's.
    const evalOf = (ply: number) => {
      const v = byPly.get(ply)?.evaluation;
      if (v == null) return 0;
      return moverWhite ? v : -v;
    };
    const raw = detectMotifs(fenBefore, h.san);
    const selfHang = raw.find((m) => m.key === "hangs_own");

    facts.push({
      variantSeed: i,
      playedPiece: PIECE_ES[h.piece] ?? "pieza",
      playedTo: h.to,
      isMate: /#/.test(h.san),
      capturedPiece: h.captured ? (PIECE_ES[h.captured] ?? null) : null,
      classification: row.classification ?? null,
      good: false,
      evalBefore: i === 0 ? 0 : evalOf(i - 1),
      evalAfter: evalOf(i),
      // Engine-tier facts stay null: this script runs no search. Pass 4 of the real
      // analysis passes exactly these values.
      bestPiece: null, bestTo: null, bestCapturedPiece: null, bestGivesCheck: false,
      bestIsCastle: false, bestIsCenterPawn: false, bestDefendsHung: false,
      onlyGoodMove: false, missedForcedMate: false,
      selfHang: selfHang?.pieceName && selfHang.square
        ? { piece: selfHang.pieceName, square: selfHang.square } : null,
      playedMotifs: raw.filter((m) => m.key !== "hangs_own")
        .map((m) => ({ key: m.key, label: m.label, piece: m.pieceName, square: m.square })),
      bestMotifs: [],
      materialLostPiece: null, materialNet: 0, materialSettled: false, materialTrades: false,
      oppCapturesPiece: null, isSacrificeConfirmed: false,
      isCastle: h.san.startsWith("O-O"),
      isPromotion: h.promotion != null,
      developsPiece: (h.piece === "n" || h.piece === "b") && /[18]$/.test(h.from),
      toCenter: ["d4", "e4", "d5", "e5"].includes(h.to),
      gaveCheck: /\+/.test(h.san),
      isBook: bookPly[i],
      isLastBookMove: i === lastBookPly,
      openingName,
      tradeVerdict: tradeVerdictFor(fens[i], h),
      trappedPiece: trappedPieceAfter(fens[i], h),
      backRankRisk: backRankBoxedIn(fens[i], moverWhite ? "w" : "b"),
      byOpponent,
      opportunity: null, tookOpportunity: null, missedOpportunity: null,
      ...positionalFlags(h, moverWhite, fens[i], i > 0 ? history[i - 1].to : null, history, i),
      ...boardReadingFacts(fenBefore, fens[i], moverWhite, h.to),
      ...endgameFlags(h, moverWhite, fens[i], i),
      dustMaterial: materialAfterDust(fens[i], moverWhite ? "w" : "b"),
    } as MoveFacts);
  }
  if (facts.length < 10) continue;

  written++;
  const name = `game-${String(written).padStart(2, "0")}-${g.id.slice(0, 8)}.json`;
  writeFileSync(new URL(name, OUT), JSON.stringify({
    game: g.id, playedAs: g.played_as, opening: g.opening, accuracy: g.accuracy, facts,
  }, null, 1) + "\n", "utf8");
  summary.push(`  ${name}  ${String(facts.length).padStart(3)} plies  ${(g.opening ?? "").slice(0, 42)}`);
}

console.log(`escritos ${written} fixtures en scripts/fixtures/coach/`);
for (const line of summary) console.log(line);
if (written < WANTED) console.log(`\nOJO: se pedían ${WANTED} y solo ${written} partidas tenían filas con \`ply\`.`);
