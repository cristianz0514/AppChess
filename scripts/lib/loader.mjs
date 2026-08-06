// Node module-resolution hook so the scripts in this directory can import the app's
// own TypeScript directly:
//
//   node --experimental-strip-types --import ./scripts/lib/register.mjs scripts/foo.mts
//
// It resolves two things Node does not:
//   • the "@/..." path alias from tsconfig.json (paths: { "@/*": ["./src/*"] })
//   • extensionless relative imports ("./attackMap" -> "./attackMap.ts"), which the
//     app's own source uses throughout
//
// Committed rather than improvised because every measurement in this project depends
// on being able to run the REAL modules — the same code the app runs, not a
// re-implementation. A re-implementation is how a measurement ends up validating the
// harness instead of the product.
const PROJECT = new URL("../../", import.meta.url).href;
const SRC = PROJECT + "src/";

async function withExtension(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try { return await nextResolve(specifier + ext, context); } catch { /* try the next */ }
    }
    throw e;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return withExtension(new URL(specifier.slice(2), SRC).href, context, nextResolve);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return withExtension(specifier, context, nextResolve);
  }
  // Bare specifiers (chess.js, @supabase/supabase-js) resolve from the project root,
  // so a script living in scripts/ still finds node_modules.
  if (!specifier.startsWith("node:") && !specifier.startsWith("file:")) {
    return nextResolve(specifier, { ...context, parentURL: PROJECT + "package.json" });
  }
  return nextResolve(specifier, context);
}
