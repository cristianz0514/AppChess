// Installs ./loader.mjs. Use with --import so the hook is active before the script's
// own imports are resolved:
//
//   node --experimental-strip-types --import ./scripts/lib/register.mjs scripts/foo.mts
import { register } from "node:module";

register(new URL("./loader.mjs", import.meta.url).href, import.meta.url);
