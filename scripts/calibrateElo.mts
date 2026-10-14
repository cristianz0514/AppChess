// Elo calibration: how well does the app's "Elo estimado" track the ratings players REALLY had?
//
//   node --experimental-strip-types --no-warnings --import ./scripts/lib/register.mjs \
//     scripts/calibrateElo.mts <out1.json> [out2.json …]
//
// Inputs are the outputs of analyzeOffline.mts run over collectCalibrationGames.cjs's
// calibration.json: real chess.com games, each carrying BOTH players' ratings at the time,
// analysed with the production pipeline (analyzeGame) at the production depth.
//
// Every game yields TWO data points — one per side — each with the rating that side really
// had. Features are computed EXACTLY the way the viewer does (book positions excluded, a
// minimum of 6 real moves), so what is measured is the number the user sees, not a cousin
// of it.
//
// What it reports, and why each part exists:
//   1. How the app's CURRENT estimate (published formula) errs, overall and by rating band.
//   2. Candidate predictors compared by leave-one-GAME-out error. An in-sample fit proves
//      nothing — that is how an earlier hand-made curve fooled its author — so every number
//      that matters here is out of sample, and both sides of a game are always held out
//      together.
//   3. The residual spread of the winner: that spread is the honest uncertainty to show.
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { isBookPosition } from "@/lib/openingBook";
import { acplForElo } from "@/lib/eloEstimate";
import { winPercent, moveAccuracy, gameAccuracy } from "@/lib/accuracy";
import { classifyWinLoss } from "@/lib/moveClassification";

interface Row {
  id: string; rating: number; timeClass: string; n: number;
  acpl: number;          // the shipped feature (per-move cap from lib/eloEstimate.ts)
  acpl2000: number;      // the ORIGINAL feature (cap 2000), kept as the baseline being replaced
  acpl300: number; acpl150: number; median: number;
  accuracy: number;      // Lichess-style, win-probability based
  errRate: number;       // share of moves that are inaccuracy or worse
  severeRate: number;    // share that are mistake or blunder
}

const rows: Row[] = [];
for (const path of process.argv.slice(2)) {
  const games = JSON.parse(readFileSync(path, "utf8")) as {
    id: string; pgn: string; whiteRating: number; blackRating: number; timeClass?: string;
    moves: { ply: number; centipawn_loss: number | null; evaluation: number | null }[]; minDepth: number | null;
  }[];
  for (const g of games) {
    if ((g.minDepth ?? 99) < 12) continue;       // a search cut short would bias the loss
    const c = new Chess();
    try { c.loadPgn(g.pgn); } catch { continue; }
    const fens: string[] = [];
    const replay = new Chess();
    for (const mv of c.history()) { replay.move(mv); fens.push(replay.fen()); }
    const evalAt = (ply: number) => (ply < 0 ? 0 : g.moves[ply]?.evaluation ?? null);
    for (const side of ["w", "b"] as const) {
      const mine = g.moves.filter((m) => (m.ply % 2 === 0) === (side === "w") && m.centipawn_loss !== null && !isBookPosition(fens[m.ply]));
      if (mine.length < 6) continue;
      const losses = mine.map((m) => m.centipawn_loss as number);
      const sign = side === "w" ? 1 : -1;
      const accs: number[] = [];
      let err = 0, severe = 0;
      for (const m of mine) {
        const b = evalAt(m.ply - 1), a = evalAt(m.ply);
        if (b == null || a == null) continue;
        const wb = winPercent(sign * b * 100), wa = winPercent(sign * a * 100);
        accs.push(moveAccuracy(wb, wa));
        const cls = classifyWinLoss(Math.max(0, wb - wa));
        if (cls === "inaccuracy" || cls === "mistake" || cls === "blunder") err++;
        if (cls === "mistake" || cls === "blunder") severe++;
      }
      if (accs.length < 6) continue;
      const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
      const sorted = [...losses].sort((x, y) => x - y);
      rows.push({
        id: g.id, rating: side === "w" ? g.whiteRating : g.blackRating, timeClass: g.timeClass ?? "?", n: mine.length,
        acpl: acplForElo(losses)!,
        acpl2000: mean(losses.map((l) => Math.min(l, 2000))),
        acpl300: mean(losses.map((l) => Math.min(l, 300))), acpl150: mean(losses.map((l) => Math.min(l, 150))),
        median: sorted[Math.floor(sorted.length / 2)],
        accuracy: gameAccuracy(accs) ?? 0, errRate: err / accs.length, severeRate: severe / accs.length,
      });
    }
  }
}

if (rows.length < 8) { console.log(`only ${rows.length} data points — not enough to say anything`); process.exit(0); }

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const corr = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.length * sd(x) * sd(y));
};

// ── Predictors: ln(rating) = a + b·feature, least squares ─────────────────────
type Feature = { name: string; get: (r: Row) => number };
const FEATURES: Feature[] = [
  { name: "ACPL, cap 2000 (the old feature)", get: (r) => r.acpl2000 },
  { name: "ACPL, cap 300", get: (r) => r.acpl300 },
  { name: "ACPL, cap 150", get: (r) => r.acpl150 },
  { name: "median loss", get: (r) => r.median },
  { name: "accuracy % (win-prob)", get: (r) => r.accuracy },
  { name: "share of inaccuracies+", get: (r) => r.errRate },
  { name: "share of mistakes+", get: (r) => r.severeRate },
];

function fit(data: Row[], f: Feature) {
  const xs = data.map(f.get), ys = data.map((r) => Math.log(r.rating));
  const mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = sxx === 0 ? 0 : xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  return { a: my - b * mx, b };
}
const predict = (m: { a: number; b: number }, f: Feature, r: Row) => Math.exp(m.a + m.b * f.get(r));

const report = (label: string, errs: number[]) =>
  console.log(`${label.padEnd(36)} bias ${String(Math.round(mean(errs))).padStart(5)}   median|err| ${String(Math.round(median(errs.map(Math.abs)))).padStart(4)}   rmse ${String(Math.round(Math.sqrt(mean(errs.map((e) => e * e))))).padStart(4)}`);

console.log(`\n${rows.length} data points from ${new Set(rows.map((r) => r.id)).size} games`);
console.log(`ratings ${Math.min(...rows.map((r) => r.rating))}–${Math.max(...rows.map((r) => r.rating))}; mean moves per side ${mean(rows.map((r) => r.n)).toFixed(0)}\n`);

// The ORIGINAL behaviour, reproduced here on purpose so the improvement stays measurable.
const oldElo = (r: Row) => Math.round(Math.max(400, Math.min(2400, 3100 * Math.exp(-0.01 * r.acpl2000))) / 10) * 10;
console.log("1) BEFORE (published formula Elo = 3100·e^(−0.01·ACPL), loss cap 2000, clamped 400–2400): estimate − real rating");
report("   all", rows.map((r) => oldElo(r) - r.rating));
for (const [lo, hi] of [[0, 900], [900, 1200], [1200, 1500], [1500, 1800], [1800, 2100], [2100, 2500], [2500, 4000]]) {
  const b = rows.filter((r) => r.rating >= lo && r.rating < hi);
  if (!b.length) continue;
  const e = b.map((r) => oldElo(r) - r.rating);
  console.log(`   ${String(lo).padStart(4)}–${String(hi).padEnd(4)} n=${String(b.length).padStart(3)}  real ${String(Math.round(mean(b.map((r) => r.rating)))).padStart(4)}  app said ${String(Math.round(mean(b.map(oldElo)))).padStart(4)} (spread ±${Math.round(sd(b.map(oldElo)))})  bias ${String(Math.round(mean(e))).padStart(5)}`);
}

console.log("\n2) Candidate predictors — correlation with ln(rating) and LEAVE-ONE-GAME-OUT error");
const ids = [...new Set(rows.map((r) => r.id))];
const results: { name: string; rmse: number; model: { a: number; b: number }; f: Feature }[] = [];
for (const f of FEATURES) {
  const c = corr(rows.map(f.get), rows.map((r) => Math.log(r.rating)));
  const loo: number[] = [];
  for (const id of ids) {
    const train = rows.filter((r) => r.id !== id), test = rows.filter((r) => r.id === id);
    if (train.length < 8) continue;
    const m = fit(train, f);
    for (const r of test) loo.push(predict(m, f, r) - r.rating);
  }
  const rmse = Math.sqrt(mean(loo.map((e) => e * e)));
  results.push({ name: f.name, rmse, model: fit(rows, f), f });
  console.log(`   ${f.name.padEnd(30)} r=${c.toFixed(2).padStart(5)}   LOO bias ${String(Math.round(mean(loo))).padStart(5)}  median|err| ${String(Math.round(median(loo.map(Math.abs)))).padStart(4)}  rmse ${String(Math.round(rmse)).padStart(4)}`);
}
const constant = (() => {
  const loo: number[] = [];
  for (const id of ids) {
    const train = rows.filter((r) => r.id !== id), test = rows.filter((r) => r.id === id);
    const m = Math.exp(mean(train.map((r) => Math.log(r.rating))));
    for (const r of test) loo.push(m - r.rating);
  }
  return Math.sqrt(mean(loo.map((e) => e * e)));
})();
console.log(`   ${"(always guess the average)".padEnd(30)}                              rmse ${String(Math.round(constant)).padStart(4)}   <- the bar a predictor has to clear`);

const best = [...results].sort((a, b) => a.rmse - b.rmse)[0];
console.log(`\nBest out of sample: ${best.name}  ln(rating) = ${best.model.a.toFixed(3)} + ${best.model.b.toFixed(4)}·x   (rmse ${Math.round(best.rmse)})`);
console.log("   examples:", [0.1, 0.3, 0.5, 0.7].map((q) => {
  const xs = rows.map(best.f.get).sort((a, b) => a - b);
  const x = xs[Math.floor(q * xs.length)];
  return `x=${x.toFixed(2)} → ${Math.round(Math.exp(best.model.a + best.model.b * x))}`;
}).join("   "));

console.log("\nraw rows (rating, acpl, accuracy, n, class):");
for (const r of [...rows].sort((a, b) => a.rating - b.rating)) console.log(`  ${String(r.rating).padStart(4)}  ${r.acpl.toFixed(1).padStart(6)}  ${r.accuracy.toFixed(1).padStart(5)}  ${String(r.n).padStart(3)}  ${r.timeClass}`);

// ── Does a longer game give a steadier estimate? (decides the minimum-moves rule) ──
{
  const f = best.f;
  const loo: { n: number; e: number }[] = [];
  for (const id of ids) {
    const train = rows.filter((r) => r.id !== id), test = rows.filter((r) => r.id === id);
    if (train.length < 8) continue;
    const m = fit(train, f);
    for (const r of test) loo.push({ n: r.n, e: predict(m, f, r) - r.rating });
  }
  console.log("\nout-of-sample error by game length (non-book moves per side):");
  for (const [lo, hi] of [[0, 16], [16, 24], [24, 32], [32, 100]]) {
    const b = loo.filter((x) => x.n >= lo && x.n < hi);
    if (b.length < 3) continue;
    console.log(`   ${String(lo).padStart(3)}–${String(hi).padEnd(3)} n=${String(b.length).padStart(3)}  rmse ${Math.round(Math.sqrt(mean(b.map((x) => x.e * x.e))))}`);
  }
}

// ── What the SHIPPED constants (lib/eloEstimate.ts) do on this data ───────────
{
  const { LN_A, B, RANGE_FACTOR, ELO_FLOOR, ELO_CEILING } = await import("@/lib/eloEstimate");
  const clamp = (v: number) => Math.max(ELO_FLOOR, Math.min(ELO_CEILING, v));
  // Restrict to the range the app claims to cover: it never reports above 2400, so judging it
  // on 3300-rated grandmasters would only measure the ceiling.
  const inRange = rows.filter((r) => r.rating >= 400 && r.rating <= 2500);
  const est = (r: Row) => clamp(Math.exp(LN_A - B * r.acpl300));
  const errs = inRange.map((r) => est(r) - r.rating);
  console.log(`\n── Shipped model (ln Elo = ${LN_A} − ${B}·ACPL300, range ×/÷ ${RANGE_FACTOR}) on ratings 400–2500, n=${inRange.length} ──`);
  report("   all", errs);
  const covered = inRange.filter((r) => r.rating >= est(r) / RANGE_FACTOR && r.rating <= est(r) * RANGE_FACTOR).length;
  console.log(`   the shown range contains the real rating ${(100 * covered / inRange.length).toFixed(0)}% of the time (target: about half)`);
  for (const [lo, hi] of [[400, 900], [900, 1200], [1200, 1500], [1500, 1800], [1800, 2100], [2100, 2500]]) {
    const b = inRange.filter((r) => r.rating >= lo && r.rating < hi);
    if (!b.length) continue;
    const e = b.map((r) => est(r) - r.rating);
    console.log(`   ${String(lo).padStart(4)}–${String(hi).padEnd(4)} n=${String(b.length).padStart(3)}  real ${String(Math.round(mean(b.map((r) => r.rating)))).padStart(4)}  app says ${String(Math.round(mean(b.map(est)))).padStart(4)}  bias ${String(Math.round(mean(e))).padStart(5)}`);
  }
  // Suggested constants from THIS data, in-sample, for updating eloEstimate.ts.
  const f300: Feature = { name: "acpl300", get: (r) => r.acpl300 };
  const m = fit(inRange, f300);
  const logErrs = inRange.map((r) => Math.abs(Math.log(predict(m, f300, r) / r.rating)));
  console.log(`\n   refit on this range: ln Elo = ${m.a.toFixed(3)} − ${(-m.b).toFixed(4)}·ACPL300;  median |ln error| ${median(logErrs).toFixed(3)}  → RANGE_FACTOR ≈ ${Math.exp(median(logErrs)).toFixed(2)}`);
}

// ── The same check, strictly out of sample, on the range the app covers ────────
{
  const inRange = rows.filter((r) => r.rating >= 400 && r.rating <= 2500);
  const f300: Feature = { name: "acpl300", get: (r) => r.acpl300 };
  const ids2 = [...new Set(inRange.map((r) => r.id))];
  const loo: { r: Row; pred: number; factor: number }[] = [];
  for (const id of ids2) {
    const train = inRange.filter((r) => r.id !== id), test = inRange.filter((r) => r.id === id);
    if (train.length < 8) continue;
    const m = fit(train, f300);
    const factor = Math.exp(median(train.map((r) => Math.abs(Math.log(predict(m, f300, r) / r.rating)))));
    for (const r of test) loo.push({ r, pred: Math.max(400, Math.min(2400, predict(m, f300, r))), factor });
  }
  console.log(`\n── Out of sample (leave-one-game-out), ratings 400–2500, n=${loo.length} ──`);
  report("   refit each time", loo.map((x) => x.pred - x.r.rating));
  const cov = loo.filter((x) => x.r.rating >= x.pred / x.factor && x.r.rating <= x.pred * x.factor).length;
  console.log(`   the shown range contained the real rating ${(100 * cov / loo.length).toFixed(0)}% of the time (it was fitted to be about half)`);
  const wide = loo.filter((x) => x.r.rating >= x.pred / (x.factor * 1.8) && x.r.rating <= x.pred * x.factor * 1.8).length;
  console.log(`   a range 1.8x wider would have contained it ${(100 * wide / loo.length).toFixed(0)}% of the time`);
  const naive = Math.exp(mean(inRange.map((r) => Math.log(r.rating))));
  console.log(`   for reference, always guessing ${Math.round(naive)}: rmse ${Math.round(Math.sqrt(mean(inRange.map((r) => (naive - r.rating) ** 2))))}`);
}

{
  const inRange = rows.filter((r) => r.rating >= 400 && r.rating <= 2500);
  const f300: Feature = { name: "acpl300", get: (r) => r.acpl300 };
  const ids3 = [...new Set(inRange.map((r) => r.id))];
  const preds: { r: Row; pred: number }[] = [];
  for (const id of ids3) {
    const train = inRange.filter((r) => r.id !== id), test = inRange.filter((r) => r.id === id);
    const m = fit(train, f300);
    for (const r of test) preds.push({ r, pred: Math.max(400, Math.min(2400, predict(m, f300, r))) });
  }
  console.log("\n   coverage of a range pred/F … pred·F, out of sample:");
  for (const F of [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0]) {
    const c = preds.filter((x) => x.r.rating >= x.pred / F && x.r.rating <= x.pred * F).length;
    console.log(`     F=${F.toFixed(1)}  ${(100 * c / preds.length).toFixed(0)}%`);
  }
}

// ── What loss is TYPICAL at a given rating (the comparator shown next to the estimate) ──
{
  const inRange = rows.filter((r) => r.rating >= 400 && r.rating <= 2500);
  const xs = inRange.map((r) => Math.log(r.rating)), ys = inRange.map((r) => r.acpl300);
  const mx = mean(xs), my = mean(ys);
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const a = my - b * mx;
  const resid = ys.map((y, i) => y - (a + b * xs[i]));
  console.log(`\n   typical ACPL300 at rating R:  ${a.toFixed(1)} + ${b.toFixed(1)}·ln(R)    (residual sd ${sd(resid).toFixed(0)}, corr ${corr(xs, ys).toFixed(2)})`);
  for (const R of [600, 800, 1000, 1200, 1500, 1800, 2200]) console.log(`     R=${R}  typical ACPL300 ≈ ${Math.round(a + b * Math.log(R))}`);
}

// ── Does the time control matter? (blitz players lose more per move at the same rating) ──
{
  const inRange = rows.filter((r) => r.rating >= 400 && r.rating <= 2500 && (r.timeClass === "blitz" || r.timeClass === "rapid"));
  const byClass = (c: string) => inRange.filter((r) => r.timeClass === c);
  console.log(`\n   time control: blitz n=${byClass("blitz").length} mean ACPL300 ${mean(byClass("blitz").map((r) => r.acpl300)).toFixed(0)} / mean rating ${Math.round(mean(byClass("blitz").map((r) => r.rating)))};  rapid n=${byClass("rapid").length} mean ACPL300 ${mean(byClass("rapid").map((r) => r.acpl300)).toFixed(0)} / mean rating ${Math.round(mean(byClass("rapid").map((r) => r.rating)))}`);
  // ln R = a + b·acpl + c·blitz, by least squares (3x3 normal equations)
  const design = (r: Row) => [1, r.acpl300, r.timeClass === "blitz" ? 1 : 0];
  const solve = (data: Row[]) => {
    const A: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (const r of data) { const x = design(r), y = Math.log(r.rating); for (let i = 0; i < 3; i++) { v[i] += x[i] * y; for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j]; } }
    // Gaussian elimination
    const M = A.map((row, i) => [...row, v[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      [M[i], M[p]] = [M[p], M[i]];
      for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
    }
    const beta = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { beta[i] = (M[i][3] - [0, 1, 2].filter((j) => j > i).reduce((s, j) => s + M[i][j] * beta[j], 0)) / M[i][i]; }
    return beta;
  };
  const ids4 = [...new Set(inRange.map((r) => r.id))];
  const looA: number[] = [], looB: number[] = [];
  for (const id of ids4) {
    const train = inRange.filter((r) => r.id !== id), test = inRange.filter((r) => r.id === id);
    const beta = solve(train);
    const m1 = fit(train, { name: "acpl300", get: (r) => r.acpl300 });
    for (const r of test) {
      looA.push(Math.exp(m1.a + m1.b * r.acpl300) - r.rating);
      const x = design(r); looB.push(Math.exp(beta[0] * x[0] + beta[1] * x[1] + beta[2] * x[2]) - r.rating);
    }
  }
  const beta = solve(inRange);
  console.log(`   ACPL only:            out-of-sample rmse ${Math.round(Math.sqrt(mean(looA.map((e) => e * e))))}`);
  console.log(`   ACPL + time control:  out-of-sample rmse ${Math.round(Math.sqrt(mean(looB.map((e) => e * e))))}   (ln R = ${beta[0].toFixed(3)} ${beta[1] < 0 ? "−" : "+"} ${Math.abs(beta[1]).toFixed(4)}·ACPL ${beta[2] < 0 ? "−" : "+"} ${Math.abs(beta[2]).toFixed(3)}·[blitz])`);
}
