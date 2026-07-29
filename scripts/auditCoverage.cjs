// Audits that the analysis machinery is actually wired end to end.
//
// This exists because a detector that compiles, typechecks and is never read is
// indistinguishable from a working one until you go looking. Three ways that
// happens, all of which bit us at least once this session:
//
//   • a fact declared in MoveFacts that no template ever reads
//   • a fact the detector never populates, so its template can never fire
//   • a module written and then never imported anywhere
//
//   node scripts/auditCoverage.cjs

const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

const comment = read("src/lib/coachComment.ts");
const detector = read("src/services/blunderDetector.ts");

// The declared fact contract.
const ifaceStart = comment.indexOf("export interface MoveFacts");
const ifaceEnd = comment.indexOf("const ART:");
const iface = comment.slice(ifaceStart, ifaceEnd);
const fields = [...iface.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);

const body = comment.slice(ifaceEnd);

const neverRead = fields.filter((f) => !new RegExp(`f\\.${f}\\b`).test(body));
const neverSet = fields.filter((f) => {
  // Populated either as `field,` shorthand, `field:` explicit, or spread in from
  // a helper whose return type names it.
  if (new RegExp(`\\b${f}\\s*[,:]`).test(detector)) return true;
  return false;
});

// Every analysis module should be imported by something that runs.
const libDir = path.join(__dirname, "..", "src", "lib");
const allSrc = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) allSrc.push({ full, text: fs.readFileSync(full, "utf8") });
  }
};
walk(path.join(__dirname, "..", "src"));

const ANALYSIS_MODULES = [
  "attackMap", "pawnStructure", "evalTerms", "threats", "endgameRules",
  "pieceSquares", "mainLine", "accuracy", "coachComment", "tacticalMotifs",
  "openingBook", "eloEstimate", "engineApi", "browserEngine", "clientAnalysis",
  "engineBuild",
];
const orphaned = ANALYSIS_MODULES.filter((m) => {
  const importers = allSrc.filter(
    (f) => !f.full.endsWith(`${m}.ts`) && new RegExp(`from ["'][^"']*${m}["']`).test(f.text),
  );
  return importers.length === 0;
});

const ok = (label, list) => {
  const clean = list.length === 0;
  console.log(`${clean ? "  OK  " : "  !!  "}${label}: ${clean ? "ninguno" : list.join(", ")}`);
  return clean;
};

console.log(`campos declarados en MoveFacts: ${fields.length}`);
const a = ok("declarados pero nunca leídos por una plantilla", neverRead);
const b = ok("declarados pero nunca rellenados por el detector", fields.filter((f) => !neverSet.includes(f)));
const c = ok("módulos de análisis sin ningún importador", orphaned);

process.exit(a && b && c ? 0 : 1);
