// Copies the Stockfish WASM build into public/engine/ so the BROWSER can load it.
//
// Runs from predev/prebuild rather than being committed: the .wasm is 7MB, and a
// binary that large in git history is a permanent tax on every clone for a file
// npm already gives us. public/engine/ is gitignored for the same reason.
//
// We ship `lite-single` deliberately. The full build is 108MB — fine on a server
// filesystem, absurd as a download. The multi-threaded `lite` build needs
// SharedArrayBuffer, which needs COOP/COEP response headers; that's a separate,
// later step, and single-threaded works everywhere today.

const fs = require("fs");
const path = require("path");

const FILES = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];
const from = path.join(__dirname, "..", "node_modules", "stockfish", "bin");
const to = path.join(__dirname, "..", "public", "engine");

fs.mkdirSync(to, { recursive: true });

for (const name of FILES) {
  const src = path.join(from, name);
  const dst = path.join(to, name);
  if (!fs.existsSync(src)) {
    console.error(`[copyEngine] MISSING ${src} — is the "stockfish" package installed?`);
    process.exit(1);
  }
  // Skip an unchanged copy so `next dev` doesn't rewrite 7MB on every restart
  // and trigger a needless reload.
  const s = fs.statSync(src);
  if (fs.existsSync(dst) && fs.statSync(dst).size === s.size) continue;
  fs.copyFileSync(src, dst);
  console.log(`[copyEngine] ${name} (${(s.size / 1048576).toFixed(1)} MB)`);
}
