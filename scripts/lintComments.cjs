// Mechanical quality gate for generated coach comments.
//
//   node scripts/lintComments.cjs <out1.json> [out2.json …]
//
// Reads the outputs of analyzeOffline.mts (real games, analysed by the production pipeline)
// and checks every stored comment for the defect classes that have actually shipped:
//   • grammar seams of template text  ("de el", "a el", doubled words, "y y", double stops)
//   • leaked values                    ("undefined", "null", "NaN", "[object")
//   • register violations              (pawn numbers like "+1.5", algebraic notation like "Nf3"/"Bxe5")
//   • length                           (more than 60 words)
//   • contradictions with the move's own badge
//       - "Se te escapó"/"Ahí estaba la oportunidad" on a move rated best/excellent/good
//       - "desperdicias"/"dejas escapar" praise-or-blame mismatches on best/excellent/good moves
//       - "la mejor de la posición" on a move the engine did not rate best
//   • repetition                       (the same sentence on several plies of one side)
//
// It cannot prove a comment TRUE — that is what the line-verification in lib/lineStory.ts and
// the tests are for — but it catches the seams and self-contradictions, mechanically, over
// thousands of comments, which reading a few games by eye never does.
const fs = require("fs");

const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: lintComments.cjs <out.json> …"); process.exit(2); }

const GOOD = new Set(["best", "excellent", "good", "brilliant", "great"]);
const issues = new Map();       // rule -> [{game, ply, text}]
let comments = 0;
const flag = (rule, g, m, extra) => {
  if (!issues.has(rule)) issues.set(rule, []);
  issues.get(rule).push({ game: g.id, ply: m.ply, cls: m.classification, text: m.explanation, extra });
};

const SEAMS = [
  ["de el ", /\bde el\b/i],
  ["a el ", /\ba el\b/i],
  ["doubled word", /\b(\w{3,})\s+\1\b/i],
  ["y y", /\by y\b/i],
  ["double stop", /[.!?]\s*\./],
  ["space before punctuation", /\s[,.;:]/],
  ["leaked value", /undefined|\bnull\b|NaN|\[object/],
  ["pawn number", /[+\-−]\d+[.,]\d/],
  ["algebraic notation", /\b[KQRBN][a-h]?x?[a-h][1-8][+#]?(?=[\s.,;:]|$)|\b[a-h]x[a-h][1-8]\b|\bO-O\b/],
  ["unfilled slot", /\$\{|\{\w+\}/],
];

for (const f of files) {
  const games = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const g of games) {
    const bySide = [new Map(), new Map()];
    for (const m of g.moves) {
      const t = m.explanation;
      if (!t) continue;
      comments++;
      for (const [rule, re] of SEAMS) if (re.test(t)) flag(rule, g, m);
      const words = t.trim().split(/\s+/).length;
      if (words > 60) flag("over 60 words", g, m, words);

      const good = GOOD.has(m.classification);
      if (good && /se te escapó|ahí estaba la oportunidad/i.test(t)) flag("reproach on a good move", g, m);
      if (good && /desperdicias|dejas escapar|se te va la ventaja|cediste terreno/i.test(t)) flag("blame on a good move", g, m);
      if (m.classification !== "best" && m.classification !== "brilliant" && m.classification !== "great" && /la mejor de la posición/i.test(t)) flag("'the best' on a non-best move", g, m);
      const bad = m.classification === "mistake" || m.classification === "blunder";
      if (bad && /^(jugada sólida|jugada tranquila|buena jugada|jugada precisa)/i.test(t)) flag("praise opening on a mistake", g, m);

      // repeated sentence on the same side (first sentence is the signature)
      const sig = t.split(/(?<=[.!?])\s/)[0];
      const side = bySide[m.ply % 2];
      side.set(sig, (side.get(sig) ?? 0) + 1);
    }
    for (const side of bySide) for (const [sig, n] of side) {
      if (n >= 4 && sig.length > 25) flag("sentence repeated 4+ times by one side", g, { ply: -1, classification: "-", explanation: sig }, n);
    }
  }
}

console.log(`${comments} comments checked in ${files.length} file(s)\n`);
let total = 0;
for (const [rule, list] of [...issues.entries()].sort((a, b) => b[1].length - a[1].length)) {
  total += list.length;
  console.log(`${String(list.length).padStart(4)}  ${rule}`);
  for (const i of list.slice(0, 4)) console.log(`        [${i.game} ply ${i.ply} ${i.cls}] ${i.text}${i.extra ? `  (${i.extra})` : ""}`);
}
console.log(total === 0 ? "\nNo issues." : `\n${total} issue(s).`);
process.exit(total === 0 ? 0 : 1);
