// Per-rule firing report for the coach's descriptive tiers.
//
//   node scripts/auditFirings.cjs
//   node scripts/auditFirings.cjs --report     # also writes docs/coach-firings.md
//
// WHY THIS EXISTS
//
// Before the rule registry, the only arbiter of which comment a move got was the
// position of its `if` in a ~50-branch chain, and there was no way to tell the two
// failure modes apart:
//
//   a detector that is never TRUE          -> the detector is wrong, or too narrow
//   a detector always OUTRANKED by another -> the priority table is wrong
//
// Both look identical from the outside: the category simply never appears. That is how
// `ownThreat` sat at 0 firings across 337 moves and `defendsAttacked` at 1 in 199
// without anyone being able to say why. This script separates them, and names the rule
// doing the suppressing — which is the evidence a priority change should cite.
//
// It also runs validatePriority on both tables and exits non-zero on any violation, so
// a table that has drifted from its registry fails here the same way auditClaims and
// auditCoverage fail on their own invariants.

const { readFileSync, readdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "lib", "coachComment.ts");
const FIXTURES = path.join(__dirname, "fixtures", "coach");
const wantReport = process.argv.includes("--report");

// Same standalone-load trick as diffComments.cjs: coachComment.ts has no imports, so it
// can be transpiled and executed directly. Keeping that property is what makes every
// measurement in this directory cheap.
const source = readFileSync(SRC, "utf8");
if (/^import\s/m.test(source)) {
  console.error("coachComment.ts tiene imports: este script lo ejecuta aislado y no resuelve dependencias.");
  process.exit(2);
}
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: "coachComment.ts",
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", "require", js)(mod.exports, mod, require);

const {
  quietCommentTraced, opponentQuietCommentTraced,
  QUIET_RULES, QUIET_PRIORITY, QUIET_CONSTRAINTS,
  OPPONENT_RULES, OPPONENT_PRIORITY, OPPONENT_CONSTRAINTS,
  validatePriority,
} = mod.exports;

for (const [name, fn] of Object.entries({ quietCommentTraced, opponentQuietCommentTraced, validatePriority })) {
  if (typeof fn !== "function") { console.error(`coachComment.ts no exporta ${name}`); process.exit(2); }
}

// ── The tables themselves ─────────────────────────────────────────────────────
let tableProblems = [];
for (const [rules, priority, constraints, label] of [
  [QUIET_RULES, QUIET_PRIORITY, QUIET_CONSTRAINTS, "QUIET_RULES"],
  [OPPONENT_RULES, OPPONENT_PRIORITY, OPPONENT_CONSTRAINTS, "OPPONENT_RULES"],
]) {
  tableProblems = tableProblems.concat(validatePriority(rules, priority, constraints, label));
}
if (tableProblems.length) {
  console.log("TABLAS DE PRIORIDAD INVÁLIDAS");
  for (const p of tableProblems) console.log("  " + p);
  console.log("");
} else {
  console.log("tablas de prioridad: OK (biyección + restricciones semánticas)");
  console.log("");
}

// ── Replay the fixtures ───────────────────────────────────────────────────────
const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error(`sin fixtures en ${FIXTURES} — corre scripts/captureFixtures.mts`);
  process.exit(2);
}

// tier -> ruleId -> { fired, applied, beatenBy: Map<winnerId, count> }
const stats = new Map();
const tierOf = (byOpponent) => (byOpponent ? "OPPONENT_RULES" : "QUIET_RULES");
function bucket(tier, id) {
  if (!stats.has(tier)) stats.set(tier, new Map());
  const t = stats.get(tier);
  if (!t.has(id)) t.set(id, { fired: 0, applied: 0, beatenBy: new Map() });
  return t.get(id);
}
// Seed every rule so a rule that never applies still shows up as a row — the whole
// point is to see the zeroes.
for (const r of QUIET_RULES) bucket("QUIET_RULES", r.id);
for (const r of OPPONENT_RULES) bucket("OPPONENT_RULES", r.id);

let plies = 0, skipped = 0;
for (const file of files) {
  const { facts } = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));
  for (const f of facts) {
    // Only the DESCRIPTIVE tier is a registry today. An error-classified move of the
    // player's goes through slotA instead, so counting it here would understate the
    // quiet rules' coverage rather than measure it.
    const isError = f.classification === "inaccuracy" || f.classification === "mistake" || f.classification === "blunder";
    if (!f.byOpponent && isError) { skipped++; continue; }
    plies++;
    const { trace } = f.byOpponent ? opponentQuietCommentTraced(f) : quietCommentTraced(f);
    const tier = tierOf(f.byOpponent);
    for (const c of trace.candidates) {
      const b = bucket(tier, c.id);
      b.applied++;
      if (c.id === trace.winnerId) b.fired++;
      else b.beatenBy.set(trace.winnerId, (b.beatenBy.get(trace.winnerId) ?? 0) + 1);
    }
  }
}

const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

say(`fixtures ${files.length}   plies medidos ${plies}   (${skipped} saltados: van por el tier de error)`);
say("");

let neverApplied = [];
for (const [tier, rules] of stats) {
  const priority = tier === "QUIET_RULES" ? QUIET_PRIORITY : OPPONENT_PRIORITY;
  say(`── ${tier} ${"─".repeat(Math.max(0, 60 - tier.length))}`);
  say("  regla                        disparó  aplicó   suprimida por");
  for (const id of priority) {
    const s = rules.get(id);
    if (!s) continue;
    const beaten = [...s.beatenBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([w, n]) => `${w}×${n}`).join(", ");
    const flag = s.applied === 0 ? "  <- nunca aplicó" : "";
    say(`  ${id.padEnd(28)} ${String(s.fired).padStart(5)}  ${String(s.applied).padStart(6)}   ${beaten}${flag}`);
    if (s.applied === 0) neverApplied.push(`${tier}/${id}`);
  }
  say("");
}

// The two numbers a priority decision actually needs.
const suppressed = [];
for (const [tier, rules] of stats) {
  for (const [id, s] of rules) {
    if (s.applied > 0 && s.fired === 0) suppressed.push(`${tier}/${id} (aplicó ${s.applied}×, nunca ganó)`);
  }
}
say("── resumen " + "─".repeat(56));
say(`reglas que nunca aplicaron        : ${neverApplied.length}`);
if (neverApplied.length) say("  " + neverApplied.join("\n  "));
say(`reglas que aplicaron y NUNCA ganaron: ${suppressed.length}`);
if (suppressed.length) say("  " + suppressed.join("\n  "));
say("");
say("Leer así: `nunca aplicó` es un problema de DETECTOR o de cobertura de fixtures.");
say("`aplicó pero nunca ganó` es un problema de PRIORIDAD, y la columna dice contra quién.");

if (wantReport) {
  const out = path.join(ROOT, "docs", "coach-firings.md");
  writeFileSync(out, "# Disparos por regla\n\n<!-- generado por scripts/auditFirings.cjs -->\n\n```\n"
    + lines.join("\n") + "\n```\n", "utf8");
  console.log(`\nescrito ${out}`);
}

process.exit(tableProblems.length ? 1 : 0);
