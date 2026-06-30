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
  outputFileTracingIncludes: {
    '/api/analyze': [
      './node_modules/stockfish/index.js',
      './node_modules/stockfish/package.json',
      './node_modules/stockfish/bin/stockfish-18-lite-single.js',
      './node_modules/stockfish/bin/stockfish-18-lite-single.wasm',
    ],
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
