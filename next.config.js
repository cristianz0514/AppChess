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
