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
};

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split(/\r?\n/);

// Which function we're inside tells us the tier, which is what the reader needs
// to know: an error-tier line only ever appears on a bad move.
const TIERS = {
  quietComment: "Descriptivo (cualquier jugada)",
  slotA: "Ranura A — qué pasó",
  slotB: "Ranura B — cómo cambió la partida",
  slotC: "Ranura C — qué era mejor",
};

const rows = [];
let tier = "";
let category = "";

for (const raw of lines) {
  const line = raw.trim();

  const fn = line.match(/^function (quietComment|slotA|slotB|slotC)\b/);
  if (fn) { tier = TIERS[fn[1]]; category = ""; continue; }

  // `if (f.foo)` / `if (f.foo?.bar)` / `const x = f.foo` all mark a new category.
  const cond = line.match(/^(?:if \(|.*\b(?:const|let) \w+ = )f\.(\w+)/);
  if (cond) category = cond[1];

  // Template literals are the sentences themselves. Skip anything that isn't
  // Spanish prose (helper expressions, key names).
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
