// Generates docs/coach-categorias.md and docs/coach-categorias.csv from the
// ACTUAL templates in src/lib/coachComment.ts.
//
// The previous catalogue was hand-written and went stale within a week — it
// described 55 categories while the code had grown past 90, so the person
// editing wording was working from fiction. Generating it from source means it
// cannot drift: if a template isn't in the code, it isn't in the doc.
//
//   node scripts/genCategoryDoc.cjs

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "lib", "coachComment.ts");
const OUT_MD = path.join(__dirname, "..", "docs", "coach-categorias.md");
const OUT_CSV = path.join(__dirname, "..", "docs", "coach-categorias.csv");

// Human names for the fact flags. Anything missing falls back to the flag name,
// which is a visible prompt to come and name it properly.
const NAMES = {
  isMate: "Jaque mate ejecutado",
  missedForcedMate: "Mate forzado que se escapó",
  onlyGoodMove: "Única jugada buena, y la encontró",
  isSacrificeConfirmed: "Sacrificio correcto",
  selfHang: "Deja una pieza propia colgada",
  oppCapturesPiece: "El rival captura algo tuyo",
  allowsMotif: "Permite una táctica del rival",
  dustMaterial: "Material tras los cambios (quiescence)",
  ignoredThreat: "Amenaza del rival ignorada (null-move)",
  ownThreat: "Amenaza propia creada (null-move)",
  underDefended: "Más atacantes que defensores",
  overloaded: "Defensor sobrecargado",
  structure: "Estructura de peones",
  allowsEnPassant: "Permite captura al paso",
  weakensKingShield: "Debilita el escudo del rey",
  kingToCenter: "Rey al centro con piezas en juego",
  knightToRim: "Caballo a la banda",
  queenOutEarly: "Dama fuera demasiado pronto",
  movesPieceTwice: "Mueve la misma pieza dos veces",
  retreats: "Repliegue de pieza",
  trappedPiece: "Pieza propia atrapada",
  backRankRisk: "Riesgo de mate en la última fila",
  bestMotifs: "Táctica disponible que se dejó pasar",
  dominantTerm: "Término de evaluación que cambió",
  classification: "Genérico por clasificación",
  isBook: "Jugada de libro (apertura)",
  isPromotion: "Coronación",
  isCastle: "Enroque",
  capturedPiece: "Captura (veredicto por SEE)",
  gaveCheck: "Jaque",
  attacksBigger: "Ataca una pieza mayor (gana tiempo)",
  pawnBreak: "Ruptura de peones",
  outpost: "Puesto avanzado",
  knightToCenter: "Caballo centralizado",
  givesKingLuft: "Da aire al rey",
  rookToSeventh: "Torre a la séptima",
  doublesRooks: "Torres dobladas",
  rookToOpenFile: "Torre a columna abierta",
  rookToSemiOpen: "Torre a columna semiabierta",
  fianchetto: "Fianchetto",
  supportsPawnChain: "Refuerza la cadena de peones",
  developsPiece: "Desarrolla una pieza",
  toCenter: "Ocupa el centro",
  theirKingWorse: "Presión sobre el rey rival",
  squareRule: "Regla del cuadrado (final de peones)",
  pawnRunsToPromote: "Peón pasado avanzando",
  opposition: "Oposición de reyes",
  kingActivates: "Rey activo en el final",
  rookBehindPassed: "Torre detrás del peón pasado",
  connectsRooks: "Torres conectadas",
  passivePiece: "Pieza olvidada / pasiva",
  evalBefore: "Transición de evaluación",
  tradeVerdict: "Veredicto del cambio (gana / parejo / pierde)",
  playedMotifs: "Táctica que la jugada montó",
  materialLostPiece: "Material perdido en la línea de castigo",
  bestDefendsHung: "La mejor jugada defendía la pieza colgada",
  bestCapturedPiece: "La mejor jugada capturaba algo",
  bestGivesCheck: "La mejor jugada daba jaque",
  bestIsCastle: "La mejor jugada era enrocar",
  bestIsCenterPawn: "La mejor jugada era un peón al centro",

  // ── Rule ids from QUIET_RULES ───────────────────────────────────────────────
  // The descriptive tier's categories are now DECLARED by each rule's id rather than
  // inferred from a condition, so these are the names of decision units. Several
  // deliberately differ from a fact name because one rule folds in several sub-cases:
  // `capture` covers recapture / winning / even, `book` covers all four theory cases.
  tactic: "Táctica ejecutada (doble, clavada, enfilada, descubierta)",
  book: "Jugada de libro (apertura)",
  promotion: "Coronación",
  castle: "Enroque",
  capture: "Captura (recaptura / gana / cambio parejo)",
  check: "Jaque",
  dustGain: "Los cambios pendientes te dejan material de más",
  looseEnemy: "Pieza rival suelta que tu jugada ataca",
  connectedPassedPair: "Dos peones pasados conectados",
  connectedPassedOne: "Peón pasado con compañero al lado",
  majority: "Mayoría de peones en un flanco",
  endgameKind: "Tipo de final (torres, alfiles del mismo color…)",
  backwardPawn: "Peón retrasado",
  islands: "Más islas de peones que el rival",
  createdPassed: "Creas un peón pasado",
  brokeTheirStructure: "Le dejas peones doblados",
  isolatedTheirs: "Aíslas un peón rival",
  gaveSelfDoubled: "Te quedan peones doblados (coste propio)",
  gaveSelfIsolated: "Dejas un peón propio aislado (coste propio)",
  battery: "Batería / piezas mayores dobladas",
  dominantTermGain: "Término de evaluación que mejoró",
  trappedAside: "Aviso: pieza propia sin casillas seguras",
  backRankAside: "Aviso: riesgo en la última fila",
  overloadedAside: "Aviso: defensor sobrecargado",
  underDefendedAside: "Aviso: más atacantes que defensores",
  endgameFallback: "Genérico de final",
  fallback: "Genérico (nada más que decir)",
};

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split(/\r?\n/);

// Which function we're inside tells us the tier, which is what the reader needs
// to know: an error-tier line only ever appears on a bad move.
// The descriptive tier is a RULE REGISTRY now, not a function with an if-chain, so its
// tier is set by the registry declaration and its categories come from each rule's
// `id` — declared, not guessed from the shape of a condition. That is strictly better
// than the regex below: the old detection missed negated guards entirely and attributed
// a template to whatever fact happened to be mentioned nearest above it.
const REGISTRY_TIERS = {
  QUIET_RULES: "Tus jugadas — descriptivo",
};
const TIERS = {
  slotA: "Tus jugadas — ranura A: qué pasó",
  slotB: "Tus jugadas — ranura B: cómo cambió la partida",
  slotC: "Tus jugadas — ranura C: qué era mejor",
  // The opponent's plies go through their own functions, in the third person and
  // from the player's side. Without these entries they all landed under
  // "(auxiliar)", which described the file's structure incorrectly.
  opponentQuietComment: "Jugadas del rival — descriptivo",
  opponentSlip: "Jugadas del rival — su fallo",
  // Not a tier the reader cares about, but it must be recognised so its templates stop
  // being attributed to whatever ran before it.
  quietComment: "Tus jugadas — descriptivo",
  opportunityClause: "Jugadas del rival — tu oportunidad",
  opportunityOutcome: "Tus jugadas — ¿aprovechaste la oportunidad?",
};

const rows = [];
let tier = "";
let category = "";
let inRegistry = false;

for (const raw of lines) {
  const line = raw.trim();

  // Entering a rule registry: its tier holds until the next function declaration.
  const reg = line.match(/^const (QUIET_RULES)\b/);
  if (reg) { tier = REGISTRY_TIERS[reg[1]]; category = ""; inRegistry = true; continue; }

  const fn = line.match(
    /^function (quietComment|slotA|slotB|slotC|opponentQuietComment|opponentSlip|opportunityClause|opportunityOutcome)\b/,
  );
  if (fn) { tier = TIERS[fn[1]]; category = ""; inRegistry = false; continue; }

  // Inside a registry the category is DECLARED by the rule's id, so there is nothing
  // to infer. Outside one, fall back to the old inference for the functions that are
  // still if-chains.
  const ruleId = inRegistry && line.match(/^id: "(\w+)"/);
  if (ruleId) { category = ruleId[1]; continue; }

  if (!inRegistry) {
    // `if (f.foo)` / `if (f.foo?.bar)` / `const x = f.foo` all mark a new category.
    const cond = line.match(/^(?:if \(|.*\b(?:const|let) \w+ = )f\.(\w+)/);
    if (cond) category = cond[1];
  }

  // Comment lines hold EXAMPLES of templates, not templates. That's how "Capturas
  // la torre en d4" and "pierdes el hilo" — both quoted inside explanatory
  // comments — ended up listed as if they were live variants.
  if (/^\s*(\/\/|\*)/.test(raw)) continue;

  // Backticks only. Also extracting double-quoted strings looked like the way to
  // catch sentences without interpolation, but the regex matched ACROSS adjacent
  // literals (`pick(["A", "B"], s)` yielded the code between them). The fix
  // belongs in the source instead: every coach sentence is a template literal,
  // interpolated or not.
  for (const m of raw.matchAll(/`([^`]*\$\{[^`]*|[^`]{12,})`/g)) {
    const text = m[1];
    if (!/[a-záéíóúñ] [a-záéíóúñ]/i.test(text)) continue;   // needs at least two words
    if (/^\s*(setoption|position|go |info)/.test(text)) continue;
    rows.push({
      tier: tier || "(auxiliar)",
      flag: category || "(varios)",
      name: NAMES[category] || category || "(sin nombrar)",
      text,
    });
  }
}

// Group for the Markdown view.
const byCat = new Map();
for (const r of rows) {
  const key = `${r.tier}||${r.flag}`;
  if (!byCat.has(key)) byCat.set(key, { ...r, texts: [] });
  byCat.get(key).texts.push(r.text);
}

const unnamed = [...byCat.values()].filter((g) => !NAMES[g.flag]).length;

let md = `# Catálogo de comentarios del coach

**Generado automáticamente** desde \`src/lib/coachComment.ts\` con
\`node scripts/genCategoryDoc.cjs\`. No lo edites a mano: se regenera y pierdes
los cambios. Para cambiar un texto, cámbialo en el código (o dime cuál y lo
cambio yo) y vuelve a generar este archivo.

- **Categorías:** ${byCat.size}
- **Variantes de texto:** ${rows.length}
- **Sin nombre humano todavía:** ${unnamed}

Los huecos entre \`\${...}\` los rellena el programa: \`f.playedPiece\` es la pieza
que se movió, \`f.playedTo\` la casilla de destino, y así. Al reescribir un texto,
manténlos tal cual.

## Cómo se combinan

Un comentario se arma con hasta **dos** ranuras: siempre A (qué pasó), más B
(cómo cambió la partida) **o** C (qué era mejor), nunca las tres. Por eso los
textos deben ser cortos: dos de ellos van a aparecer juntos.

El nivel *Descriptivo* es distinto: se usa cuando la jugada no fue un error, y
va solo.

`;

let currentTier = "";
for (const g of [...byCat.values()].sort((a, b) => a.tier.localeCompare(b.tier))) {
  if (g.tier !== currentTier) { currentTier = g.tier; md += `\n---\n\n## ${currentTier}\n`; }
  md += `\n### ${g.name}\n\n_Bandera:_ \`${g.flag}\`\n\n`;
  g.texts.forEach((t, i) => { md += `${i + 1}. ${t}\n`; });
}

fs.writeFileSync(OUT_MD, md, "utf8");

// CSV for spreadsheet editing. Semicolon-delimited and BOM-prefixed so Excel in
// a Spanish locale opens it in columns instead of dumping everything in A1.
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = "﻿" + ["nivel;categoria;bandera;variante;texto_actual;texto_corregido"]
  .concat(rows.map((r, i) => [
    esc(r.tier), esc(r.name), esc(r.flag), i + 1, esc(r.text), '""',
  ].join(";")))
  .join("\r\n");
fs.writeFileSync(OUT_CSV, csv, "utf8");

console.log(`${byCat.size} categorías, ${rows.length} variantes`);
console.log(`sin nombre humano: ${unnamed}`);
console.log(`escritos:\n  ${OUT_MD}\n  ${OUT_CSV}`);
