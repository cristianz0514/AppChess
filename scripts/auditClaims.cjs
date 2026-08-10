// Which template makes a factual CLAIM without consulting the fact that owns it?
//
//   node scripts/auditClaims.cjs
//
// WHY THIS EXISTS
//
// The coach has several methods that evaluate a move — SEE (tradeVerdictFor),
// quiescence (materialAfterDust / materialOverLine), the attack table, the
// null-move threat search, win probability — and for a long time nothing said
// which of them owned which question. Each one's output fed straight into a
// first-match-wins template chain, so CHAIN POSITION was the only arbiter. Two
// consequences, both found the hard way by a reader spotting them:
//
//   Qxe3+, an even queen trade, was described as "La dama de e3 queda sin
//   defensa" — the attack table answering a question that belonged to SEE.
//
//   Bxg3 was described as "te llevabas el alfil" when g3 was defended by two
//   pawns, so the move only TRADES bishops — slot C asserting a material gain
//   without ever asking SEE.
//
// Both are the same defect: a sentence asserting something no fact in scope
// established. This script looks for the rest of them, instead of waiting for a
// reader to hit each one.
//
// A PROSE DOCUMENT WOULD NOT HAVE WORKED
//
// This repo already learned that. scripts/genCategoryDoc.cjs exists because the
// hand-written category catalogue "described 55 categories while the code had
// grown past 90" — the person editing wording was working from fiction. An
// authority table kept as prose would rot exactly the same way, so it is kept
// here as data, next to the check that enforces it.
//
// HONEST LIMITS
//
// Scope is approximated by reading the facts mentioned on the template's own line
// and in the few lines above it, not by parsing the TypeScript. Conditions
// established further up a block are invisible to it, so output is a list of
// claims TO REVIEW, not a list of proven bugs. Every hit still needs a human to
// confirm — which is cheap, and far cheaper than the alternative of finding them
// one screenshot at a time.

const fs = require("fs");
const path = require("path");

// Optional path argument, so the same audit can be pointed at another revision of the
// file (`git show HEAD:src/lib/coachComment.ts > tmp.ts`). That is how a change to the
// SCOPE heuristic below gets verified: if widening the window were hiding real findings,
// running the new script against the old source would show fewer than the old script did.
const SRC = process.argv[2] || path.join(__dirname, "..", "src", "lib", "coachComment.ts");

// ── The authority table ───────────────────────────────────────────────────────
//
// One row per QUESTION, not per detector. `says` is how a template signals it is
// making that claim; `authorizedBy` is the set of facts entitled to establish it.
// A template matching `says` without any of `authorizedBy` in scope is asserting
// something it did not check.
const AUTHORITIES = [
  {
    question: "¿Esta captura GANA material (no es un cambio)?",
    owner: "SEE — tradeVerdict / materialNet",
    says: [
      /\bte llevabas\b/i, /\bcae gratis\b/i, /sin compensación/i,
      /no lo recupera/i, /no lo paga/i, /\bganas material\b/i,
      /gana material\b/i, /\bcapturaba\b/i,
    ],
    // NOT capturedPiece, and NOT bestCapturedPiece. Those establish only that a
    // capture HAPPENS — they say nothing about whether it gains anything. Listing
    // them here is how the first draft of this table waved through the very bug
    // that prompted it: "Con el alfil a g3 te llevabas el alfil", on a square
    // defended by two pawns, where the move merely TRADES bishops. Asserting a
    // gain requires something that resolved the exchange.
    authorizedBy: [
      "tradeVerdict", "materialNet", "materialLostPiece", "dustMaterial",
      "isSacrificeConfirmed", "playedMotifs", "bestMotifs", "bestTradeVerdict",
      "opportunity", "missedOpportunity",
    ],
  },
  {
    question: "¿Se pierde material a lo largo de la línea?",
    owner: "quiescence / la línea del motor — materialLostPiece, dustMaterial",
    // "pierdes el hilo" and "entrega la partida" are figures of speech about the
    // OUTCOME, not about material, and belong to the win-probability row below.
    // Excluding them is a correction to the table, not a loosening of the check.
    says: [
      /\bpierdes (la|el) (?!hilo\b)\w+/i,
      /te cuesta (la|el) \w+/i,
      /\bentrega (la|el) (?!partida\b|iniciativa\b)\w+/i,
    ],
    // allowsEnPassant IS the authority for losing that particular pawn: it
    // establishes the capture is available, which is the whole claim.
    authorizedBy: [
      "materialLostPiece", "materialSettled", "materialNet", "dustMaterial",
      "oppCapturesPiece", "selfHang", "trappedPiece", "punishFollowUp",
      "allowsEnPassant",
    ],
  },
  {
    question: "¿Hay una pieza suelta AHORA?",
    owner: "tabla de ataques — selfHang / underDefended / motivo hanging",
    says: [/queda sin defensa/i, /se queda colgad/i, /sin ningún defensor/i, /nadie (la|lo) defiende/i],
    authorizedBy: ["selfHang", "underDefended", "playedMotifs", "overloaded", "defendsAttacked", "loose"],
  },
  {
    question: "¿Este cambio es PAREJO?",
    owner: "SEE — tradeVerdict / isRecapture",
    // Anchored on the EVENNESS assertion, never on the verb alone: "cambiabas"
    // also appears in "cambiaba el ritmo", which is about tempo, not material.
    // Third figurative phrase to slip through a first-draft pattern here, after
    // "pierdes el hilo" and "entrega la partida" — the verbs of this vocabulary
    // are all metaphors somewhere, so only the claim itself is safe to match.
    says: [/cambio parejo/i, /queda saldado/i, /vuelve a estar igual/i, /quedan iguales/i, /\ben igualdad\b/i],
    // bestTradeVerdict belongs here as well as in the gain row: it is SEE speaking
    // about the RECOMMENDED move, so it authorizes "cambiabas X, un cambio parejo"
    // exactly as tradeVerdict authorizes the same claim about the played move.
    authorizedBy: ["tradeVerdict", "bestTradeVerdict", "isRecapture", "capturedPiece"],
  },
  {
    question: "¿Hay mate?",
    owner: "la búsqueda — isMate / missedForcedMate / ownThreat.kind / band(evalAfter)",
    says: [/jaque mate/i, /\bmate en\b/i, /\bhay mate\b/i, /mate forzado/i, /red de mate/i],
    // `band` joins this list as a fourth authority. A mate score is encoded as
    // ±(MATE_SCORE − N), so `band(f.evalAfter) === "mate"` is the engine saying "mate",
    // exactly as directly as isMate does — and it is the only one of the four that
    // speaks on the plies BEFORE the mating move, which is where 62% of the mates on
    // the board were going unmentioned. Added when this audit correctly flagged the
    // four new mateNet templates: the claim was sound, the table just did not know the
    // fact that backs it yet.
    authorizedBy: ["isMate", "missedForcedMate", "ownThreat", "ignoredThreat", "opportunity", "band", "evalAfter"],
  },
  {
    question: "¿Cambió el resultado de la partida?",
    owner: "probabilidad de victoria — classification + band(evalAfter)",
    says: [/entrega la partida/i, /cambia la partida/i, /pierdes el hilo/i, /pasa a mandar/i],
    authorizedBy: ["classification", "evalAfter", "evalBefore"],
  },
];

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split(/\r?\n/);

const FN = /^function (quietComment|slotA|slotB|slotC|opponentQuietComment|opponentSlip|opportunityClause|opportunityOutcome)\b/;
// A rule in QUIET_RULES / OPPONENT_RULES. Its guards are always the first statements of
// `applies`, so the rule's opening is part of every template's scope no matter how far
// down the body that template sits.
const RULE = /^\s*id: "(\w+)", group: "\w+"/;
const LOOKBACK = 10;
const GUARD_LINES = 12;   // code lines from a rule's `id:` that can still be its guard

const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

// Where each line's enclosing rule starts, so scope can always reach the guards.
// Before the registry refactor every template lived inside a top-level `function` and a
// flat lookback was enough. Now a rule is an object literal with its guards at the top
// and its templates 15 lines below, and the flat window could no longer see them — it
// reported three sound `mateNet` templates as unauthorised while `band(f.evalAfter)` sat
// right at the top of the same rule.
const ruleStartOf = new Array(lines.length).fill(-1);
{
  let current = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RULE);
    if (m) current = i;
    ruleStartOf[i] = current;
  }
}

// Facts visible from a template on `idx`: everything named on its own line, the code
// lines just above (where this file's guards live), and its rule's own guard block.
//
// COMMENT lines do not consume the lookback budget. A comment cannot establish a fact,
// so spending window on it was arbitrary — and this file documents its reasoning
// heavily, which meant the better-explained a rule was, the less of it the audit could
// see. Counting only code makes the window mean "the last 10 things that RAN".
function factsInScope(idx) {
  const found = new Set();
  const note = (l) => {
    for (const m of l.matchAll(/\bf\.(\w+)/g)) found.add(m[1]);
    // Locals destructured from a fact keep its authority: `const d = f.selfHang`
    // then `d.square` is still the attack table speaking.
    for (const m of l.matchAll(/\b(?:const|let) (\w+) = f\.(\w+)/g)) { found.add(m[2]); found.add(m[1]); }
    if (/\bloose\b|\btactic\b|\bt\.kind\b/.test(l)) found.add("loose");
  };

  let budget = LOOKBACK;
  for (let k = idx; k >= 0 && budget >= 0; k--) {
    note(lines[k]);
    if (!isComment(lines[k])) budget--;
  }

  const start = ruleStartOf[idx];
  if (start >= 0) {
    let seen = 0;
    for (let k = start; k < lines.length && seen < GUARD_LINES; k++) {
      note(lines[k]);
      if (!isComment(lines[k])) seen++;
    }
  }
  return found;
}

const findings = [];
let fn = "(auxiliar)";
let claimsChecked = 0;

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const trimmed = raw.trim();
  const f = trimmed.match(FN);
  if (f) { fn = f[1]; continue; }
  // Report the RULE id when the template lives in a registry. Every one of the 53
  // templates was being labelled "(auxiliar)" since the refactor, which is useless for
  // finding the thing being reported.
  const r = raw.match(RULE);
  if (r) { fn = r[1]; continue; }
  if (/^\s*(\/\/|\*)/.test(raw)) continue;          // comments hold examples, not templates

  for (const m of raw.matchAll(/`([^`]*)`/g)) {
    const text = m[1];
    if (text.length < 12 || !/[a-záéíóúñ] [a-záéíóúñ]/i.test(text)) continue;
    const scope = factsInScope(i);
    for (const a of AUTHORITIES) {
      if (!a.says.some((r) => r.test(text))) continue;
      claimsChecked++;
      if (a.authorizedBy.some((k) => scope.has(k))) continue;
      findings.push({ line: i + 1, fn, question: a.question, owner: a.owner, text });
    }
  }
}

console.log(`plantillas con un reclamo factual : ${claimsChecked}`);
console.log(`reclamos SIN el hecho que los autoriza : ${findings.length}`);
console.log("");
if (findings.length === 0) {
  console.log("  OK  todo reclamo consulta a su autoridad");
} else {
  const byQ = new Map();
  for (const x of findings) byQ.set(x.question, [...(byQ.get(x.question) ?? []), x]);
  for (const [q, xs] of byQ) {
    console.log(`── ${q}`);
    console.log(`   autoridad: ${xs[0].owner}`);
    for (const x of xs) {
      console.log(`   coachComment.ts:${x.line}  [${x.fn}]`);
      console.log(`     ${x.text.slice(0, 100)}`);
    }
    console.log("");
  }
  console.log("Cada uno hay que confirmarlo a mano: el alcance se aproxima leyendo");
  console.log("las líneas cercanas, no parseando TypeScript, así que hay falsos positivos.");
}
