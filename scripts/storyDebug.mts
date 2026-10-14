// Shows, for chosen plies of a game, the engine lines the comment pass reads and what
// lib/lineStory.ts makes of them — to see WHY a ply did or did not get a verified story.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/lib/register.mjs \
//     scripts/storyDebug.mts <games.json> <gameIndex> <ply> [ply …]
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { createNodeEngine } from "./lib/nodeEngine.mts";
import { buildStory, replay, lineNet } from "@/lib/lineStory";
import { winPercent } from "@/lib/accuracy";
import { classifyWinLoss } from "@/lib/moveClassification";

const [, , file, gi, ...plies] = process.argv;
const game = JSON.parse(readFileSync(file, "utf8"))[Number(gi)];
const c = new Chess();
c.loadPgn(game.pgn);
const hist = c.history({ verbose: true });
const fens: string[] = [];
const r = new Chess();
for (const m of hist) { r.move(m.san); fens.push(r.fen()); }
const startFen = new Chess().fen();

const engine = createNodeEngine();
const sans = (from: string, pv: string[]) => {
  const b = new Chess(from); const out: string[] = [];
  for (const u of pv) { try { const m = b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || "q" }); if (!m) break; out.push(m.san); } catch { break; } }
  return out;
};
const cp = (l: { mate: number | null; scoreCp: number | null } | undefined) =>
  l == null ? null : l.mate != null ? (l.mate > 0 ? 100 - l.mate / 100 : -100 - l.mate / 100) * 100 : l.scoreCp;

for (const p of plies.map(Number)) {
  const fenBefore = p === 0 ? startFen : fens[p - 1];
  const moverWhite = p % 2 === 0;
  const best = await engine.getTopLines(fenBefore, 16, 2);
  const reply = await engine.getTopLines(fens[p], 16, 1);
  const bestSans = best[0] ? sans(fenBefore, best[0].pv) : [];
  const replySans = reply[0] ? sans(fens[p], reply[0].pv) : [];
  const evB = (best[0]?.scoreCp ?? 0) / 100;
  // eval after, mover's view: the reply line is scored for the side to move (the opponent).
  const evA = -((reply[0]?.scoreCp ?? 0) / 100);
  const winLost = Math.max(0, winPercent(evB * 100) - winPercent(evA * 100));
  const cls = classifyWinLoss(winLost);
  const L = replay(fenBefore, [hist[p].san, ...replySans]);
  console.log(`\n── ply ${p} ${moverWhite ? "w" : "b"} ${hist[p].san}  eval ${evB.toFixed(2)} → ${evA.toFixed(2)}  (${cls})`);
  console.log(`   best  : ${bestSans.join(" ")}`);
  console.log(`   reply : ${replySans.join(" ")}`);
  console.log(`   net(mover) over played line: ${L.length >= 2 ? lineNet(fenBefore, L, moverWhite ? "w" : "b") : "n/a"}   2nd-best cp: ${cp(best[1])}`);
  for (const byOpponent of [false, true]) {
    const s = buildStory({
      fenBefore, playedSan: hist[p].san, mover: moverWhite ? "w" : "b", byOpponent,
      reply: replySans, best: bestSans, evalBefore: evB, evalAfter: evA, classification: cls, good: cls === "best" || cls === "excellent",
    });
    console.log(`   story (${byOpponent ? "rival" : "tú   "}): ${s ? JSON.stringify(s) : "null"}`);
  }
}
engine.close();
