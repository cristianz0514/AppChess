// Run the app's REAL analysis (analyzeGame) on PGNs, with a real Stockfish and no database.
//
//   OFFLINE_STUB=1 node --experimental-strip-types --no-warnings \
//     --import ./scripts/lib/register.mjs scripts/analyzeOffline.mts <games.json> <out.json> [from] [to]
//
// <games.json> is an array of { id, pgn, playedAs: "white"|"black", opening?, whiteRating?, blackRating? }.
// <out.json> gets, per game: the stored moves (classification, loss, evaluation, best_move,
// best_line, explanation), the game accuracy, the engine depths reached and the timing.
//
// It exists to look at what the app ACTUALLY says on real games (comment quality work) and
// to measure what it actually computes (Elo calibration) — with the production code path,
// not a re-implementation of it.
import { readFileSync, writeFileSync } from "node:fs";
import { analyzeGame } from "@/services/blunderDetector";
import { createNodeEngine } from "./lib/nodeEngine.mts";
import { store } from "./lib/supabaseStub.mts";

const [, , gamesPath, outPath, fromArg, toArg] = process.argv;
if (!gamesPath || !outPath) {
  console.error("usage: analyzeOffline.mts <games.json> <out.json> [from] [to]");
  process.exit(2);
}
const all = JSON.parse(readFileSync(gamesPath, "utf8")) as {
  id: string; pgn: string; playedAs: "white" | "black"; opening?: string | null;
  whiteRating?: number; blackRating?: number; timeClass?: string;
}[];
const from = fromArg ? parseInt(fromArg) : 0;
const to = toArg ? parseInt(toArg) : all.length;

const engine = createNodeEngine();
const results: unknown[] = [];
for (let g = from; g < Math.min(to, all.length); g++) {
  const game = all[g];
  store.game = { played_as: game.playedAs, opening: game.opening ?? null };
  store.moves = [];
  store.gameUpdate = {};
  const depthsFrom = engine.depthsReached.length;
  const t0 = Date.now();
  try {
    await analyzeGame(game.id, game.pgn, engine);
  } catch (e) {
    console.error(`[${g}] ${game.id} failed:`, (e as Error).message);
    continue;
  }
  // Depth 0 is a position with no legal move (the board after a mate): not a shortened search.
  const depths = engine.depthsReached.slice(depthsFrom).filter((d) => d > 0);
  results.push({
    ...game,
    seconds: Math.round((Date.now() - t0) / 1000),
    minDepth: depths.length ? Math.min(...depths) : null,
    accuracy: store.gameUpdate.accuracy ?? null,
    moves: store.moves,
  });
  console.log(`[${g}] ${game.id} ${store.moves.length} plies, ${Math.round((Date.now() - t0) / 1000)}s, minDepth ${depths.length ? Math.min(...depths) : "-"}`);
  writeFileSync(outPath, JSON.stringify(results));
}
engine.close();
