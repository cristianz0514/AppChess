// Which errors still get no explanation, and what do their lines have in common?
//
//   node scripts/minePatterns.cjs <out1.json> [out2.json …] [--show feature] [--n 12]
//
// Reads outputs of analyzeOffline.mts (they carry `traces`: for every ply, the lines the comment
// pass was given and what it made of them). An error is UNEXPLAINED when its story has no
// consequence and no better move, i.e. the comment fell back to the descriptive rules. For those
// it tags simple, checkable features of the two lines — "captures the same square as the best
// move but with another piece", "does not retake", "queen move" — and counts them. The features
// that cover the most unexplained errors are the ones worth writing a pattern for; --show prints
// the cases behind one feature so the pattern can be read off real positions rather than guessed.
const fs = require("fs");
const { Chess } = require("chess.js");

const args = process.argv.slice(2);
const showIdx = args.indexOf("--show");
const show = showIdx >= 0 ? args[showIdx + 1] : null;
const nIdx = args.indexOf("--n");
const nShow = nIdx >= 0 ? parseInt(args[nIdx + 1]) : 12;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--show" && args[i - 1] !== "--n");
if (files.length === 0) { console.error("usage: minePatterns.cjs <out.json> … [--show feature] [--n N]"); process.exit(2); }

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const isError = (c) => c === "inaccuracy" || c === "mistake" || c === "blunder";

function first(fen, san) {
  try { const c = new Chess(fen); const m = c.move(san); return m ? { m, after: c.fen() } : null; } catch { return null; }
}

function features(t, g) {
  const inp = t.input;
  const P = first(inp.fenBefore, inp.playedSan);
  const B = inp.best.length ? first(inp.fenBefore, inp.best[0]) : null;
  const f = [];
  if (!P) return f;
  const pm = P.m;
  if (B) {
    const bm = B.m;
    if (pm.captured && bm.captured && pm.to === bm.to && pm.piece !== bm.piece) f.push("misma captura, otra pieza");
    if (pm.captured && !bm.captured) f.push("capturas pero lo mejor era una jugada tranquila");
    if (!pm.captured && bm.captured) f.push("no capturas y lo mejor era capturar");
    if (!pm.captured && !bm.captured && pm.piece === bm.piece) f.push("misma pieza, otra casilla");
    if (!pm.captured && !bm.captured && pm.piece !== bm.piece) f.push("otra pieza, ambas tranquilas");
    if (bm.san.startsWith("O-O")) f.push("lo mejor era enrocar");
    if (/[+#]/.test(bm.san) && !/[+#]/.test(pm.san)) f.push("lo mejor daba jaque");
    if (/[+#]/.test(pm.san) && !/[+#]/.test(bm.san)) f.push("juegas un jaque y lo mejor no");
    if (bm.piece === "p" && pm.piece !== "p") f.push("lo mejor era un avance de peón");
  }
  if (pm.piece === "q") f.push("mueves la dama");
  if (pm.piece === "k" && !pm.san.startsWith("O-O")) f.push("mueves el rey");
  if (pm.piece === "p") f.push("mueves un peón");
  if (pm.san.startsWith("O-O")) f.push("enrocas");
  // does not retake: the previous ply captured on a square, and this move neither retakes there
  // nor is a capture at all, while the best move does retake
  try {
    const before = new Chess(inp.fenBefore);
    const hist = before.history({ verbose: true });
    void hist;
  } catch { /* history is not available from a FEN; use the game below */ }
  const prev = g.prevCaptureSquare?.get(t.ply);
  if (prev && B && B.m.captured && B.m.to === prev && !(pm.captured && pm.to === prev)) f.push("no recapturas");
  // the move retreats or leaves a square the piece was attacked on
  const back = (pm.color === "w" ? 1 : -1) * (Number(pm.to[1]) - Number(pm.from[1])) < 0;
  if (back && pm.piece !== "p") f.push("retrocedes una pieza");
  return f;
}

const tallies = new Map();
const cases = new Map();
let total = 0, explained = 0;
for (const file of files) {
  for (const g of JSON.parse(fs.readFileSync(file, "utf8"))) {
    // squares captured on the ply before each ply, from the game itself
    const c = new Chess(); try { c.loadPgn(g.pgn); } catch { continue; }
    const hist = c.history({ verbose: true });
    const prevCap = new Map();
    hist.forEach((m, i) => { if (i > 0 && hist[i - 1].captured) prevCap.set(i, hist[i - 1].to); });
    const gg = { ...g, prevCaptureSquare: prevCap };
    for (const t of g.traces ?? []) {
      if (!isError(t.input.classification)) continue;
      total++;
      const s = t.story;
      if (s && (s.allows || s.better)) { explained++; continue; }
      for (const feat of features(t, gg)) {
        tallies.set(feat, (tallies.get(feat) ?? 0) + 1);
        if (!cases.has(feat)) cases.set(feat, []);
        cases.get(feat).push({ game: g.id, ply: t.ply, mine: (t.ply % 2 === 0) === (g.playedAs === "white"), t });
      }
    }
  }
}

console.log(`${total} errores / imprecisiones; con historia (consecuencia o mejor jugada): ${explained}; sin explicación: ${total - explained}\n`);
for (const [k, v] of [...tallies.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);

if (show) {
  console.log(`\n── casos: ${show} ──`);
  for (const c of (cases.get(show) ?? []).slice(0, nShow)) {
    const i = c.t.input;
    console.log(`\n${c.game.slice(0, 18)} ply ${c.t.ply} ${c.mine ? "TÚ" : "RIVAL"} ${i.playedSan} (${i.classification}) eval ${i.evalBefore.toFixed(1)} → ${i.evalAfter.toFixed(1)}`);
    console.log(`  mejor : ${i.best.slice(0, 6).join(" ")}`);
    console.log(`  tras  : ${i.reply.slice(0, 6).join(" ")}`);
    console.log(`  texto : ${c.t.text}`);
  }
}
