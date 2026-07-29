// Copies the Stockfish WASM builds into public/engine/ so the BROWSER can load them.
//
// Runs from predev/prebuild rather than being committed: these are 230MB of
// binaries that npm already provides, and putting them in git history would tax
// every clone forever. public/engine/ is gitignored for the same reason.
//
// We ship all four WASM flavours and let the browser pick at runtime
// (src/lib/browserEngine.ts), because the right choice depends on the device and
// not on us:
//
//   full + threads   strongest; needs cross-origin isolation AND 108MB
//   full, 1 thread   same strength, no headers needed, still 108MB
//   lite + threads   7MB, weaker net, needs isolation
//   lite, 1 thread   7MB, runs literally everywhere — the floor
//
// Leaving a capable desktop on the lite build wastes it; handing a phone on
// cellular a 108MB download is worse than useless. Shipping all four is what
// makes "use the best the device can actually run" possible.

const fs = require("fs");
const path = require("path");

const FILES = [
  "stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm",
  "stockfish-18-lite.js", "stockfish-18-lite.wasm",
  "stockfish-18-single.js", "stockfish-18-single.wasm",
  "stockfish-18.js", "stockfish-18.wasm",
];

const from = path.join(__dirname, "..", "node_modules", "stockfish", "bin");
const to = path.join(__dirname, "..", "public", "engine");

fs.mkdirSync(to, { recursive: true });

let copied = 0, skipped = 0, bytes = 0;
for (const name of FILES) {
  const src = path.join(from, name);
  const dst = path.join(to, name);
  if (!fs.existsSync(src)) {
    console.error(`[copyEngine] MISSING ${src} — is the "stockfish" package installed?`);
    process.exit(1);
  }
  const s = fs.statSync(src);
  bytes += s.size;
  // Skip an unchanged copy: otherwise every `next dev` restart rewrites 230MB
  // and stalls startup for no reason.
  if (fs.existsSync(dst) && fs.statSync(dst).size === s.size) { skipped++; continue; }
  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[copyEngine] ${name} (${(s.size / 1048576).toFixed(1)} MB)`);
}

console.log(`[copyEngine] ${copied} copiados, ${skipped} ya estaban — ${(bytes / 1048576).toFixed(0)} MB en public/engine`);
