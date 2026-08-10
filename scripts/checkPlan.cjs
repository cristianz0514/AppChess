// What the coach says the POINT of a move is, checked against hand-built lines.
//
//   node scripts/checkPlan.cjs
//
// WHY THIS EXISTS
//
// scripts/diffComments.cjs replays 435 real plies, and it reported "IDÉNTICO — 0
// diferencias" for a change that rewrote how the plan clause is chosen. It was right to:
// the fixtures are captured without an engine, so `bestFollowUp`, `opportunity` and every
// other main-line fact sit at their no-engine values there. The A/B diff is blind to this
// entire tier, which is exactly the coverage risk the refactor plan wrote down and never
// closed.
//
// So the plan clause gets checked where it can be: on lines built by hand, replayed
// through the real readLine/followUpClause. Each case names the defect it guards.
//
// The interesting one is the RECAPTURE case. A line's second move for the advised side is
// usually the point of the first — but when it is just the retake ("you take, they take,
// you take back") it explains nothing, so it used to ANNUL the clause. Lines that open
// with a capture are most of the interesting ones, and those are precisely the lines whose
// second move is the retake. Measured over 25 real games: 151 comments recommended a move
// and 3 said what for.

const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Chess } = require("chess.js");

// Optional path, so the same cases can be run against another revision. That is how these
// cases were shown to be worth anything: pointed at HEAD's mainLine.ts before the change,
// the two recapture cases must FAIL. A check that passes on the code it was written to
// test and also on the code it was written to reject is testing nothing.
const SRC = process.argv[2] || path.join(__dirname, "..", "src", "lib", "mainLine.ts");
const js = ts.transpileModule(readFileSync(SRC, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: "mainLine.ts",
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", "require", js)(mod.exports, mod, require);
const { readLine, followUpClause } = mod.exports;

// Every case is replayed through chess.js first, so an illegal line fails loudly here
// instead of silently producing an empty plan and a passing test.
const CASES = [
  {
    name: "segunda jugada normal -> la nombra ('y después')",
    fen: "4k3/6r1/8/8/8/8/3R1B2/4K3 w - - 0 1",
    line: ["Rd7", "Kf8", "Rxg7"],
    voice: "player",
    expect: "y después te llevas la torre de g7",
    why: "el caso base: mi segunda jugada ES el punto de la primera",
  },
  {
    name: "segunda jugada = recaptura -> salta a la TERCERA",
    fen: "4k3/6r1/8/2p5/8/8/3R1B2/4K3 w - - 0 1",
    line: ["Rd4", "cxd4", "Bxd4", "Kf8", "Bxg7+"],
    voice: "player",
    // Rd4 va a d4; cxd4 se lo come; Bxd4 recaptura EN d4 -> no explica nada. El punto
    // real es Bxg7, la tercera jugada mía.
    expect: "y acabas llevándote la torre de g7",
    why: "antes esto devolvía null y el comentario nombraba la jugada sin decir para qué",
  },
  {
    name: "recaptura + voz del rival -> 'acaba llevándose'",
    fen: "4k3/6r1/8/2p5/8/8/3R1B2/4K3 w - - 0 1",
    line: ["Rd4", "cxd4", "Bxd4", "Kf8", "Bxg7+"],
    voice: "opponent",
    expect: "y acaba llevándose la torre de g7",
    why: "la misma línea contada del otro lado; invertir la voz es el error más confuso posible",
  },
  {
    name: "línea de una sola jugada -> sin plan",
    fen: "4k3/6r1/8/8/8/8/3R1B2/4K3 w - - 0 1",
    line: ["Rd7"],
    voice: "player",
    expect: null,
    why: "no hay segunda jugada: callar es correcto",
  },
  {
    name: "recaptura sin tercera jugada -> sin plan",
    fen: "4k3/8/8/2p5/8/8/3R1B2/4K3 w - - 0 1",
    line: ["Rd4", "cxd4", "Bxd4"],
    voice: "player",
    expect: null,
    // El tope son tres jugadas mías: más allá la línea es del motor, no del rival.
    why: "salta la recaptura, no encuentra tercera, y no se inventa una",
  },
];

let failed = 0;
for (const c of CASES) {
  // Legality first. A typo in a SAN would otherwise read as "the plan is null", which is
  // also what a real defect looks like.
  const board = new Chess(c.fen);
  let illegal = null;
  for (const san of c.line) {
    try { if (!board.move(san)) illegal = san; } catch { illegal = san; }
    if (illegal) break;
  }
  if (illegal) {
    console.log(`  ILEGAL  ${c.name}\n          la jugada "${illegal}" no es legal en esa posición`);
    failed++;
    continue;
  }

  const mover = new Chess(c.fen).turn();
  const plan = readLine(c.fen, c.line, mover);
  const got = followUpClause(plan, c.voice);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`  ${ok ? "OK  " : "FALLA"}  ${c.name}`);
  console.log(`          ${c.why}`);
  if (!ok) console.log(`          esperaba: ${JSON.stringify(c.expect)}\n          obtuvo  : ${JSON.stringify(got)}`);
}

console.log(`\n${CASES.length - failed}/${CASES.length} casos del plan correctos`);
process.exit(failed ? 1 : 0);
