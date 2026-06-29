const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/middleware-manifest\.json$/],
})

module.exports = withPWA({
  reactStrictMode: true,
  // Keep stockfish external so its dynamic require()/wasm loading isn't bundled by webpack.
  serverExternalPackages: ['stockfish'],
  // Force-include ONLY the lite-single engine (~7MB) in the analyze function bundle,
  // and exclude the 100MB+ full engines so the serverless function stays under limits.
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
