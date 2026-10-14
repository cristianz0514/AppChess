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

const LITE = [
  "stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm",
  "stockfish-18-lite.js", "stockfish-18-lite.wasm",
];
const FULL = [
  "stockfish-18-single.js", "stockfish-18-single.wasm",
  "stockfish-18.js", "stockfish-18.wasm",
];

// ENGINE_LITE_ONLY=1 ships just the 7MB builds. Used for the hosted deploy: the
// 108MB full nets are slower per position than lite at the same depth (see
// engineBuild.ts) and browserEngine already picks lite first, so they only add
// ~215MB of static files to every deployment. A device that forces a full build
// simply fails to load it and is demoted back to lite.
const FILES = process.env.ENGINE_LITE_ONLY === "1" ? LITE : [...LITE, ...FULL];

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
