// Hand-built MoveFacts for the ENGINE tier, which the captured fixtures cannot reach.
//
//   node scripts/genSynthetic.cjs           # writes scripts/fixtures/coach/synthetic.json
//   node scripts/genSynthetic.cjs --show    # …and prints what each case actually says
//
// `--show` is not a convenience. A fixture file of 20 opaque fact objects cannot be
// reviewed, and the A/B diff only reports what CHANGED — a case that was wrong before and
// is still wrong shows up as no diff at all. Printing the sentences is the only way a
// person can check that these cases assert the right thing.
//
// WHY THIS EXISTS
//
// scripts/captureFixtures.mts rebuilds facts without running Stockfish, so in all eight
// captured games every main-line fact — bestFollowUp, opportunity, punishFollowUp,
// bestTradeVerdict, missedForcedMate — sits at its no-engine value. That is honest, and
// documented there. The consequence is that scripts/diffComments.cjs replays 435 plies
// and reports "IDÉNTICO" for a change that rewrote slot C and opportunityClause. It is
// not wrong; it simply never exercised them.
//
// The refactor plan called this the real risk of the whole effort — "un error de
// transcripción en una regla no ejercitada pasa en silencio" — and left the synthetic
// fixtures unwritten. This closes it for the tier that was measured to matter most: 94 of
// 151 recommendations across 25 real games came from opportunityClause, which had no plan
// clause at all.
//
// The base fact is COPIED from a real captured fixture rather than typed out. MoveFacts
// has 91 fields; a hand-written literal would drift from the interface the first time a
// field is added, and would encode my idea of a neutral value instead of the pipeline's.
// Each case then overrides only what it is about, so the diff of this file reads as the
// list of things being tested.

const { readFileSync, writeFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const FIXTURES = path.join(__dirname, "fixtures", "coach");
const OUT = path.join(FIXTURES, "synthetic.json");

const donorFiles = readdirSync(FIXTURES).filter((f) => /^game-.*\.json$/.test(f)).sort();
if (donorFiles.length === 0) {
  console.error("no hay fixtures game-*.json de donde copiar el hecho base");
  process.exit(2);
}
// A genuinely unremarkable player ply, so each case says ONLY what it is about. The first
// version accepted any "excellent" ply and picked a castling move, which meant the base
// fact had isCastle set: two mate cases came out as "Enrocas: el rey queda protegido"
// because their own rule had thrown and `castle` was the next thing that applied. A
// donor with any shape flag on hides the case under an unrelated category.
const SHAPE_FLAGS = [
  "isCastle", "isPromotion", "developsPiece", "toCenter", "gaveCheck", "retreats",
  "knightToRim", "givesKingLuft", "rookToOpenFile", "rookToSeventh", "doublesRooks",
  "fianchetto", "isRecapture", "kingToCenter", "movesPieceTwice", "queenOutEarly",
  "pawnBreak", "knightToCenter", "rookToSemiOpen", "supportsPawnChain", "outpost",
  "weakensKingShield", "isEndgame", "theirKingWorse", "isBook",
];
const isNeutral = (f) =>
  !f.byOpponent && !f.good && f.playedMotifs.length === 0 && f.attacksBigger == null
  && f.capturedPiece == null && f.tradeVerdict == null && SHAPE_FLAGS.every((k) => !f[k]);

// Searched across ALL the captured games, not just the first. The first file happens to
// have zero neutral plies, and pinning to it made the generator fail outright — a donor
// this specific is not something one game is guaranteed to contain.
let NEUTRAL = null, donor = null;
for (const file of donorFiles) {
  const { facts: fs_ } = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8"));
  const hit = fs_.find(isNeutral);
  if (hit) { NEUTRAL = hit; donor = file; break; }
}
if (!NEUTRAL) {
  console.error("ningún fixture tiene un ply lo bastante neutro para servir de base");
  process.exit(2);
}

// Every case says what it guards. A case with no `why` is a case nobody can maintain.
const CASES = [
  // ── opportunityClause: the 94 ────────────────────────────────────────────────
  {
    why: "oportunidad sin plan — la línea no tenía segunda jugada, así que se calla",
    over: { byOpponent: true, classification: "mistake", opportunity: { piece: "caballo", to: "h5", captures: null, isMate: false, plan: null } },
  },
  {
    why: "oportunidad CON plan y sin captura — el hueco principal: 94 recomendaciones, 0 planes",
    over: { byOpponent: true, classification: "mistake", opportunity: { piece: "caballo", to: "h5", captures: null, isMate: false, plan: "y después te llevas el alfil de f4" } },
  },
  {
    why: "oportunidad CON plan y captura de pieza distinta — 'Ahí tienes' evita el tartamudeo de 'te llevas'",
    over: { byOpponent: true, classification: "blunder", opportunity: { piece: "caballo", to: "f4", captures: "alfil", isMate: false, plan: "y después te llevas la torre de d5" } },
  },
  {
    why: "misma pieza captura y capturada: nombrar las dos suena a tartamudeo, la casilla basta",
    // Casillas distintas a propósito: si la captura y el plan cayeran en la misma, el
    // caso leería como un bug del código en vez de como el caso que es.
    over: { byOpponent: true, classification: "blunder", opportunity: { piece: "peón", to: "d5", captures: "peón", isMate: false, plan: "y después te llevas la torre de a8" } },
  },
  {
    why: "oportunidad de mate — el mate ES el plan, no se le añade cláusula",
    over: { byOpponent: true, classification: "blunder", opportunity: { piece: "dama", to: "h7", captures: null, isMate: true, plan: "y después te llevas la torre de d5" } },
  },
  {
    why: "plan de TERCERA jugada ('acabas llevándote') tras saltar la recaptura",
    over: { byOpponent: true, classification: "mistake", opportunity: { piece: "torre", to: "d4", captures: null, isMate: false, plan: "y acabas llevándote la torre de g7" } },
  },

  // ── slot C: the recommended move and its point ───────────────────────────────
  {
    why: "captura recomendada que GANA + plan: la captura ya no se come la cláusula",
    over: { classification: "mistake", bestPiece: "alfil", bestTo: "g3", bestCapturedPiece: "alfil", bestTradeVerdict: "gana", bestFollowUp: "y después te llevas la torre de d5" },
  },
  {
    why: "captura recomendada que GANA sin plan: conserva las dos variantes de siempre",
    over: { classification: "mistake", bestPiece: "alfil", bestTo: "g3", bestCapturedPiece: "alfil", bestTradeVerdict: "gana", bestFollowUp: null },
  },
  {
    why: "cambio PAREJO + plan: SEE dice que no gana nada, el plan dice para qué sirve igual",
    over: { classification: "inaccuracy", bestPiece: "alfil", bestTo: "d3", bestCapturedPiece: "alfil", bestTradeVerdict: "pareja", bestFollowUp: "y después te llevas el caballo de e4" },
  },
  {
    why: "captura que PIERDE material: el plan es lo único que puede justificar un sacrificio",
    over: { classification: "blunder", bestPiece: "torre", bestTo: "h7", bestCapturedPiece: "peón", bestTradeVerdict: "pierde", bestFollowUp: "y sigues con jaque de la dama en h5" },
  },
  {
    why: "plan sin captura: el camino que ya funcionaba, para que no se rompa",
    over: { classification: "mistake", bestPiece: "dama", bestTo: "c7", bestCapturedPiece: null, bestFollowUp: "y después te llevas el caballo de d5" },
  },
  {
    why: "mate desperdiciado: la alternativa tiene que hablar del mate, no del peón",
    over: { classification: "blunder", missedForcedMate: true, bestPiece: "torre", bestTo: "e7", bestCapturedPiece: "peón", bestTradeVerdict: "gana", bestFollowUp: "y remata con la torre en e8" },
  },
  {
    why: "secuencia forzada que gana una pieza, sin segunda jugada propia que nombrar",
    over: { classification: "mistake", bestPiece: "caballo", bestTo: "f6", bestFollowUp: null, bestLineForced: true, bestLineWins: { piece: "dama", square: "d8" } },
  },

  // ── the punishment line, on the player's own error ───────────────────────────
  {
    why: "línea de castigo en voz del RIVAL: 'se lleva', nunca 'te llevas'",
    over: { classification: "blunder", oppCapturesPiece: "caballo", punishFollowUp: "y luego se lleva la torre de a8", materialNet: 3, materialSettled: true },
  },

  // ── the mate band ────────────────────────────────────────────────────────────
  {
    why: "mate corto a mi favor: la distancia es fiable dentro de una búsqueda a 16",
    over: { evalBefore: 9997, evalAfter: 9998, classification: "best" },
  },
  {
    why: "mate lejano: la distancia es una cota superior, así que sólo se da el veredicto",
    over: { evalBefore: 9990, evalAfter: 9991, classification: "best" },
  },
  {
    why: "mate a mi favor CON casilla conocida: ownThreat manda, la distancia se aparta",
    over: { evalBefore: 9995, evalAfter: 9996, classification: "best", ownThreat: { kind: "mate", piece: "dama", square: "g2" } },
  },
  {
    why: "mate en contra: el aviso, y qué sirve todavía",
    over: { evalBefore: -9995, evalAfter: -9994, classification: "best" },
  },
  {
    why: "mate a favor del jugador visto desde el ply del RIVAL (evalAfter es del que mueve)",
    over: { byOpponent: true, evalBefore: -9996, evalAfter: -9997, classification: "best" },
  },
  {
    why: "mate del RIVAL contra el jugador, desde el ply del rival",
    over: { byOpponent: true, evalBefore: 9996, evalAfter: 9995, classification: "best" },
  },

  // ── the two branches that BYPASS the descriptive registry ────────────────────
  // A `good` ply and an error ply never reach QUIET_RULES, so mateNet cannot speak on
  // them. Measured: those were the last 4 of the 29 mate-silent plies in 25 real games.
  {
    why: "ply BRILLANTE con mate a mi favor: el mate es la noticia, no el elogio",
    over: { good: true, classification: "brilliant", evalBefore: 9997, evalAfter: 9998, playedMotifs: [{ key: "double", label: "doble" }] },
  },
  {
    why: "ERROR que me deja matado: lo más urgente que puede decir un comentario",
    over: { classification: "blunder", evalBefore: -5.2, evalAfter: -9997 },
  },
  {
    why: "ERROR con mate a mi favor y casilla conocida: aquí slotA SÍ nombra la casilla",
    // deferToSquareRule=false en slotA: no hay regla ownThreat a la que cederle el turno,
    // así que callar la casilla sería callar el mate entero.
    over: { classification: "mistake", evalBefore: 9996, evalAfter: 9997, ownThreat: { kind: "mate", piece: "torre", square: "e8" } },
  },
  {
    why: "ERROR con mate lejano a mi favor: el consejo se invierte, no lo persigas",
    over: { classification: "blunder", evalBefore: 9990, evalAfter: 9989 },
  },

  // ── rey pelado: mate LEJANO que sí se persigue ───────────────────────────────
  // Reportado con posición real (ply 160-172): el rival en `kd5` y nada más, y el
  // comentario decía "no te distraigas con el material" con cero material en el tablero,
  // y "no lo fuerces" en el ply donde el jugador daba jaque para acorralar. Un mate contra
  // rey pelado es lejano Y trivial, combinación que la división cerca/lejos no preveía.
  // `bareKing` es relativo a QUIEN MUEVE, así que el signo se invierte entre los dos tiers
  // — que es justo el error a evitar.
  {
    why: "rey pelado del rival, mate lejano: técnica, no cálculo, y NADA de material",
    over: { evalBefore: 9990, evalAfter: 9991, classification: "best", bareKing: "theirs" },
  },
  {
    why: "rey pelado del rival visto desde el ply del RIVAL: bareKing es 'mine' aquí",
    over: { byOpponent: true, evalBefore: -9990, evalAfter: -9991, classification: "best", bareKing: "mine" },
  },
  {
    why: "mi rey pelado y me van a matar: no recomendar cambios que no puedo hacer",
    over: { evalBefore: -9992, evalAfter: -9993, classification: "best", bareKing: "mine" },
  },
];

const facts = CASES.map((c, i) => ({
  ...structuredClone(NEUTRAL),
  // The seed drives pick(), so it has to vary or every case reads the same variant. Using
  // the index keeps it deterministic, which is what the byte-for-byte diff needs.
  variantSeed: i,
  ...c.over,
}));

writeFileSync(OUT, JSON.stringify({
  game: "synthetic",
  playedAs: "white",
  opening: null,
  accuracy: null,
  note: "Generado por scripts/genSynthetic.cjs — no editar a mano. Cada hecho es un caso del tier del motor.",
  cases: CASES.map((c, i) => ({ seed: i, why: c.why })),
  facts,
}, null, 1) + "\n", "utf8");

console.log(`escritos ${facts.length} hechos sintéticos en ${path.relative(path.join(__dirname, ".."), OUT)}`);
console.log(`hecho base copiado de ${donor} (ply ${NEUTRAL.variantSeed})`);

if (process.argv.includes("--show")) {
  // Same standalone load as diffComments/auditFirings: coachComment.ts has no imports.
  const tsc = require("typescript");
  const SRC = path.join(__dirname, "..", "src", "lib", "coachComment.ts");
  const js = tsc.transpileModule(readFileSync(SRC, "utf8"), {
    compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2020 },
    fileName: "coachComment.ts",
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", js)(mod.exports, mod, require);
  console.log("");
  facts.forEach((f, i) => {
    console.log(`[${String(i).padStart(2)}] ${CASES[i].why}`);
    console.log(`     ${mod.exports.composeCoachComment(f)}`);
  });
}
