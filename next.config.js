const ENGINE_FILES = [
  './node_modules/stockfish/index.js',
  './node_modules/stockfish/package.json',
  './node_modules/stockfish/bin/stockfish-18-lite-single.js',
  './node_modules/stockfish/bin/stockfish-18-lite-single.wasm',
]

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable PWA in all environments until service worker compatibility is confirmed
  disable: true,
  buildExcludes: [/middleware-manifest\.json$/],
})

module.exports = withPWA({
  reactStrictMode: true,
  serverExternalPackages: ['stockfish'],

  // Cross-origin isolation, which is what unlocks SharedArrayBuffer and
  // therefore the MULTI-THREADED Stockfish builds. Without these two headers
  // the browser can only ever run the single-threaded engine.
  //
  // COEP is `credentialless` rather than `require-corp` on purpose.
  // `require-corp` would isolate a few more browsers, but it breaks any
  // cross-origin subresource that doesn't send a CORP header — so the first
  // external image or font added later would silently vanish. Every asset here
  // is local today (checked), but `credentialless` means that stays a
  // performance question instead of becoming a broken page. Where it isn't
  // supported the app simply isn't isolated and picks a single-threaded build:
  // slower, never broken.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        // The engine gets an immutable year-long cache. Next serves public/ with
        // `max-age=0`, which means the browser must revalidate before using it:
        // a round trip on every single visit before any analysis can start, and
        // because the ETag is derived from size and mtime it CHANGES on every
        // deploy — so each deploy made every user re-download 7MB of WASM that
        // hadn't actually changed.
        //
        // Safe to cache forever because the filename carries the engine version
        // (stockfish-18-…). Shipping a different Stockfish changes the URL, which
        // is exactly the invalidation mechanism `immutable` assumes.
        source: '/engine/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
  // The WASM must be traced into the bundle for every route that still runs the
  // engine SERVER-side. Full-game analysis moved to the browser (it loads the
  // engine from public/engine, copied there by scripts/copyEngine.cjs), but the
  // bot opponent, move hints, exercises and puzzles each still do a single
  // search here — and they used to inherit this tracing from '/api/analyze',
  // which no longer exists.
  outputFileTracingIncludes: {
    '/api/bestmove': ENGINE_FILES,
    '/api/champions/move': ENGINE_FILES,
    '/api/exercise': ENGINE_FILES,
    '/api/puzzles/**': ENGINE_FILES,
  },
  outputFileTracingExcludes: {
    '*': [
      './node_modules/stockfish/bin/stockfish-18.wasm',
      './node_modules/stockfish/bin/stockfish-18.js',
      './node_modules/stockfish/bin/stockfish-18-single.wasm',
      './node_modules/stockfish/bin/stockfish-18-single.js',
      './node_modules/stockfish/bin/stockfish-18-lite.wasm',
      './node_modules/stockfish/bin/stockfish-18-lite.js',
      './node_modules/stockfish/bin/stockfish-18-asm.js',
      './node_modules/stockfish/bin/stockfish.wasm',
      './node_modules/stockfish/bin/stockfish.js',
    ],
  },
})
