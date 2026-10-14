// How much of what the coach says is a VERIFIED story (cause and effect over the next plies)
// versus a generic or purely descriptive sentence?
//
//   node scripts/measureStories.cjs <out1.json> [out2.json …]
//
// Reads the outputs of analyzeOffline.mts. Classifies each stored comment by its wording — a
// heuristic, deliberately conservative: a comment counts as a story only when it contains the
// phrasing lib/lineStory.ts produces — and reports the share per kind of move. Run it on the
// corpus before and after a change to see whether the change moved the number it was meant to.
const fs = require("fs");

const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: measureStories.cjs <out.json> …"); process.exit(2); }

const STORY = new RegExp([
  "permite", "queda sin defensa", "ya estaba atacad", "te lo llevas", "te la llevas", "se lo lleva", "se la lleva",
  "acabas llevándote", "acaba llevándose", "atacabas", "atacaba", "acababas", "acababa", "ganabas", "ganaba", "evitabas", "lo evitabas",
  "Se le escapó", "tenías mate", "mate forzado", "un doble", "ya no puede evitar", "coronar", "cambio de damas",
  "abres la línea", "abre una línea", "dejas sin defensa", "deja sin defensa", "el cambio te cuesta", "el cambio te favorece",
].join("|"));
const GENERIC = new RegExp([
  "pierdes el hilo", "le das la iniciativa", "se te complica de golpe", "cambia la partida", "Error importante",
  "Jugada equivocada", "Pequeña imprecisión", "No es grave", "Se puede jugar mejor", "Imprecisión: cedes",
  "pasa de (igualada|algo|claramente)", "Aun así, esa jugada le cuesta", "Pero el motor la marca",
  "Jugada tranquila", "Jugada sólida", "sin cambios en la posición", "entra en juego (desde|en) \\w\\d\\.?$",
  "fuera de su casilla inicial", "repliega", "sigue equilibrada", "sigues (con|en) ", "quedas (con|en) ",
  "El rival (juega|mueve) (el|la) \\w+ a \\w\\d\\.?$",
].join("|"));

const kinds = {
  "errores míos (error / error grave)": (m, mine) => mine && ["mistake", "blunder"].includes(m.classification),
  "errores del rival (error / error grave)": (m, mine) => !mine && ["mistake", "blunder"].includes(m.classification),
  "imprecisiones (las dos partes)": (m) => m.classification === "inaccuracy",
  "mis jugadas buenas (mejor / excelente / bien)": (m, mine) => mine && ["best", "excellent", "good"].includes(m.classification),
  "jugadas buenas del rival": (m, mine) => !mine && ["best", "excellent", "good"].includes(m.classification),
};
const tally = Object.fromEntries(Object.keys(kinds).map((k) => [k, { n: 0, story: 0, generic: 0 }]));

for (const f of files) {
  for (const g of JSON.parse(fs.readFileSync(f, "utf8"))) {
    for (const m of g.moves) {
      const t = m.explanation;
      if (!t) continue;
      const mine = (m.ply % 2 === 0) === (g.playedAs === "white");
      for (const [k, test] of Object.entries(kinds)) {
        if (!test(m, mine)) continue;
        const c = tally[k];
        c.n++;
        if (STORY.test(t)) c.story++;
        else if (GENERIC.test(t)) c.generic++;
      }
    }
  }
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—").padStart(4);
console.log("tipo de jugada".padEnd(48), "n".padStart(5), " historia  genérico");
for (const [k, c] of Object.entries(tally)) {
  console.log(k.padEnd(48), String(c.n).padStart(5), "  ", pct(c.story, c.n), "     ", pct(c.generic, c.n));
}
