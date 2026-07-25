// One-off generator: turns the lichess-org/chess-openings TSVs into a TS module.
// Run from the repo root with the five TSVs already downloaded:
//   for f in a b c d e; do curl -sO https://raw.githubusercontent.com/lichess-org/chess-openings/master/$f.tsv; done
//   node scripts/genOpenings.cjs .
const fs = require("fs");
const path = require("path");

const dir = process.argv[2] || ".";
const lines = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const file = path.join(dir, `${f}.tsv`);
  if (!fs.existsSync(file)) continue;
  const rows = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 1; i < rows.length; i++) {
    const parts = rows[i].split("\t");
    if (parts.length < 3) continue;
    const pgn = parts[2].trim();
    if (!pgn) continue;
    // "1. e4 e5 2. Nf3" -> "e4 e5 Nf3"
    const sans = pgn.replace(/\d+\.(\.\.)?/g, " ").trim().split(/\s+/).filter(Boolean);
    if (sans.length) lines.push(sans.join(" "));
  }
}

const uniq = [...new Set(lines)].sort();
const header = [
  "// GENERATED from lichess-org/chess-openings (CC0) by scripts/genOpenings.cjs.",
  "// Do not edit by hand.",
  "//",
  `// ${uniq.length} opening lines, replacing the 73 hand-curated ones: with only`,
  '// those, an English Opening left the book at move 2 and every theory move fell',
  '// through to the generic "sacas la pieza y ganas actividad" comment.',
  "export const ECO_LINES: string[] = ",
].join("\n");

fs.writeFileSync(
  path.join("src", "lib", "ecoOpenings.ts"),
  `${header}${JSON.stringify(uniq)};\n`,
);
console.log(`lineas=${uniq.length} kb=${Math.round(JSON.stringify(uniq).length / 1024)}`);
