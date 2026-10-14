// Collects public chess.com games of players across the whole rating range, for calibrating
// the Elo estimate against REAL ratings (the estimate was never verified: see the NOT YET
// VERIFIED note in blunderDetector.ts).
//
//   node scripts/collectCalibrationGames.cjs <outDir> [perBin] [seed]
//
// Source: chess.com's public API, the same one the app itself imports from. A sample of the
// Colombian player list gives accounts from beginners to masters; the top of the range comes
// from the public leaderboards. Each game is kept only when both players' ratings are in the
// PGN-adjacent JSON, so one game yields TWO calibration points (one per side, each with the
// rating that side actually had).
//
// Uses curl rather than fetch: on some corporate networks Node's TLS stack rejects the chess.com
// certificate chain while curl (system store) does not.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const out = process.argv[2];
const perBin = parseInt(process.argv[3] || "4");
if (!out) { console.error("usage: collectCalibrationGames.cjs <outDir> [perBin]"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const UA = "AnaliChess-calibration/1.0 (+https://github.com/cristianz0514/AppChess)";
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const txt = execFileSync("curl", ["-s", "-m", "60", "-H", `User-Agent: ${UA}`, url], { maxBuffer: 80 * 1024 * 1024 }).toString();
      if (txt && txt.trim().startsWith("{")) return JSON.parse(txt);
    } catch { /* retry */ }
    sleep(1500 * (i + 1));
  }
  return null;
}

const BINS = [[600, 900], [900, 1200], [1200, 1500], [1500, 1800], [1800, 2100], [2100, 2400], [2400, 2700], [2700, 3400]];
const bin = (r) => BINS.findIndex(([a, b]) => r >= a && r < b);

// 1) candidate accounts
let names = [];
const co = get("https://api.chess.com/pub/country/CO/players");
if (co && co.players) names = co.players;
console.log("CO players:", names.length);
// deterministic-ish shuffle (seeded) so reruns pick the same people
let seed = parseInt(process.argv[4] || "20261014");
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }

const picked = BINS.map(() => []);
function consider(u, stats) {
  for (const cls of ["chess_blitz", "chess_rapid"]) {
    const r = stats?.[cls]?.last?.rating;
    const games = (stats?.[cls]?.record?.win || 0) + (stats?.[cls]?.record?.loss || 0) + (stats?.[cls]?.record?.draw || 0);
    if (!r || games < 30) continue;
    const b = bin(r);
    if (b >= 0 && picked[b].length < perBin * 2 && !picked[b].some((p) => p.u === u)) { picked[b].push({ u, cls: cls.replace("chess_", ""), rating: r }); return; }
  }
}
// top of the range
const lb = get("https://api.chess.com/pub/leaderboards");
for (const cls of ["live_blitz", "live_rapid"]) for (const p of (lb?.[cls] || []).slice(0, 12)) consider(p.username, { [cls.replace("live_", "chess_")]: { last: { rating: p.score }, record: { win: 99 } } });

for (const u of names.slice(0, 700)) {
  if (picked.every((p) => p.length >= perBin * 2)) break;
  const st = get(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/stats`);
  if (st) consider(u, st);
  sleep(150);
}
console.log("accounts per bin:", picked.map((p) => p.length).join(","));

// 2) one-two games each from the most recent archive month with games
const games = [];
for (let b = 0; b < BINS.length; b++) {
  let got = 0;
  for (const p of picked[b]) {
    if (got >= perBin) break;
    const arch = get(`https://api.chess.com/pub/player/${encodeURIComponent(p.u)}/games/archives`);
    const months = (arch?.archives || []).slice(-3).reverse();
    let found = null;
    for (const m of months) {
      const mg = get(m);
      const cand = (mg?.games || []).filter((g) => g.rules === "chess" && g.rated && g.time_class === p.cls && g.pgn
        && !/Abandoned|abandoned/.test(g.pgn)
        && g.white?.rating && g.black?.rating
        && ((g.pgn.match(/\d+\.\s/g) || []).length * 2) >= 36 && ((g.pgn.match(/\d+\.\s/g) || []).length * 2) <= 100);
      if (cand.length) { found = cand[Math.floor(rnd() * cand.length)]; break; }
      sleep(150);
    }
    if (!found) continue;
    const white = found.white.username.toLowerCase() === p.u.toLowerCase();
    games.push({
      id: `${p.u}-${(found.url || "").split("/").pop()}`, pgn: found.pgn, playedAs: white ? "white" : "black", opening: null,
      whiteRating: found.white.rating, blackRating: found.black.rating, timeClass: found.time_class, subject: p.u, bin: b,
    });
    got++;
    sleep(200);
  }
  console.log(`bin ${BINS[b][0]}-${BINS[b][1]}: ${got} games`);
}
fs.writeFileSync(path.join(out, "calibration.json"), JSON.stringify(games));
console.log("saved", games.length, "games ->", path.join(out, "calibration.json"));
