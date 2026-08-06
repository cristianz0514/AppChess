// Byte-for-byte A/B diff of the coach's output, between a git revision and the
// working tree.
//
//   node scripts/diffComments.cjs                 # vs HEAD
//   node scripts/diffComments.cjs --rev abc1234   # vs a specific revision
//   node scripts/diffComments.cjs --show 40       # print more changed plies
//
// WHY THIS EXISTS
//
// coachComment.ts is being refactored from first-match-wins if-chains into a rule
// registry with a declared priority table. That refactor has to be provably
// behaviour-preserving before the priority order is allowed to change, otherwise a
// transcription slip and an intended improvement land in the same commit and neither
// can be attributed.
//
// So this serves two opposite purposes with the same code:
//   • on the mechanical refactor, the gate is ZERO diffs;
//   • on the deliberate reorder, the diff list IS the change log, reviewed ply by ply
//     and pasted into the commit message.
//
// HOW IT LOADS TWO VERSIONS AT ONCE
//
// coachComment.ts has no imports — deliberately, and this is the payoff. That means it
// can be transpiled in memory and executed standalone, so the OLD version can be read
// straight out of git and run beside the new one. No `quietCommentLegacy` copy left in
// the tree to remember to delete, and the check stays re-runnable at any commit
// boundary forever.
//
// If the file ever gains an import, this fails loudly rather than silently comparing
// something wrong: that is the signal it was split and this loader needs a resolver.

const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");
const SRC_REL = "src/lib/coachComment.ts";
const FIXTURES = path.join(__dirname, "fixtures", "coach");

const argv = process.argv.slice(2);
const rev = argv.includes("--rev") ? argv[argv.indexOf("--rev") + 1] : "HEAD";
const show = argv.includes("--show") ? Number(argv[argv.indexOf("--show") + 1]) : 25;

function loadModule(source, label) {
  if (/^import\s/m.test(source)) {
    console.error(
      `\n${SRC_REL} (${label}) tiene imports. Este arnés lo ejecuta aislado y no\n` +
      `resuelve dependencias. Si el archivo se dividió a propósito, hay que darle un\n` +
      `resolutor a este script antes de volver a confiar en el diff.\n`);
    process.exit(2);
  }
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: SRC_REL,
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", js)(mod.exports, mod, require);
  if (typeof mod.exports.composeCoachComment !== "function") {
    console.error(`${label}: no exporta composeCoachComment`);
    process.exit(2);
  }
  return mod.exports;
}

const oldSource = execFileSync("git", ["show", `${rev}:${SRC_REL}`], {
  cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
});
const newSource = readFileSync(path.join(ROOT, SRC_REL), "utf8");

if (oldSource === newSource) {
  console.log(`${SRC_REL} es idéntico a ${rev}: no hay nada que comparar.`);
  process.exit(0);
}

const A = loadModule(oldSource, rev);
const B = loadModule(newSource, "árbol de trabajo");

const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error(`sin fixtures en ${FIXTURES} — corre scripts/captureFixtures.mts primero`);
  process.exit(2);
}

let plies = 0, diffs = 0, threwOld = 0, threwNew = 0;
const changes = [];

for (const file of files) {
  const { game, facts } = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));
  for (const f of facts) {
    plies++;
    // A throw is itself a behaviour difference worth reporting, so it is captured as a
    // value rather than allowed to abort the run.
    let a, b;
    try { a = A.composeCoachComment(f); } catch (e) { a = `((lanzó)) ${e.message}`; threwOld++; }
    try { b = B.composeCoachComment(f); } catch (e) { b = `((lanzó)) ${e.message}`; threwNew++; }
    if (a === b) continue;
    diffs++;
    changes.push({
      game: (game ?? file).slice(0, 8),
      ply: f.variantSeed,
      side: f.byOpponent ? "RIVAL" : "TÚ",
      move: f.playedPiece + " a " + f.playedTo,
      cls: f.classification ?? "-",
      old: a, new: b,
    });
  }
}

console.log(`fixtures      : ${files.length}`);
console.log(`plies          : ${plies}`);
console.log(`comparando     : ${rev}  ->  árbol de trabajo`);
if (threwOld || threwNew) console.log(`excepciones    : ${rev}=${threwOld}  worktree=${threwNew}`);
console.log("");
console.log(diffs === 0
  ? "IDÉNTICO — 0 diferencias. El refactor no cambió ni un byte de la salida."
  : `${diffs} plies con texto distinto (${((100 * diffs) / plies).toFixed(1)}%)`);

for (const c of changes.slice(0, show)) {
  console.log("");
  console.log(`  ${c.game} ply ${String(c.ply).padStart(3)} [${c.side}] ${c.move} (${c.cls})`);
  console.log(`    antes: ${c.old}`);
  console.log(`    ahora: ${c.new}`);
}
if (changes.length > show) console.log(`\n  … y ${changes.length - show} más (usa --show N)`);

// Non-zero on any difference, so the mechanical-refactor stage can gate on it in a
// single command.
process.exit(diffs === 0 ? 0 : 1);
