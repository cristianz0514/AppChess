import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Parameters/variables prefixed with _ are intentionally unused (e.g. a
      // callback that must accept an argument it doesn't read).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node build/audit scripts (CommonJS, run by hand or in CI) — not app
    // code; their `require()` calls were 31 of the lint errors and hid the
    // real ones.
    "scripts/**",
  ]),
]);

export default eslintConfig;
