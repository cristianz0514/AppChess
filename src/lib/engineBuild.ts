// Which Stockfish build should THIS device run?
//
// Four are shipped. The strongest one a device can actually finish downloading
// and hold in memory is the right one — leaving a desktop on the 7MB net wastes
// it, and handing a phone on cellular 108MB is worse than useless.
//
// Two rules keep this honest:
//   • never pick a build the device can't run (isolation, memory, bandwidth)
//   • if a pick FAILS at runtime, remember that and drop down permanently
//
// The second rule is what makes shipping the 108MB net safe at all. Capability
// APIs lie or are missing; an actual failed load does not. So a device that OOMs
// on the big net gets demoted once and never pays that cost again.

export type BuildId = "full-mt" | "full-st" | "lite-mt" | "lite-st";

interface Build {
  id: BuildId;
  file: string;
  megabytes: number;
  threaded: boolean;
  label: string;
}

// The catalogue, ordered by raw evaluation strength.
export const BUILDS: Build[] = [
  { id: "full-mt", file: "stockfish-18.js", megabytes: 108, threaded: true, label: "completo, multihilo" },
  { id: "full-st", file: "stockfish-18-single.js", megabytes: 108, threaded: false, label: "completo" },
  { id: "lite-mt", file: "stockfish-18-lite.js", megabytes: 7, threaded: true, label: "ligero, multihilo" },
  { id: "lite-st", file: "stockfish-18-lite-single.js", megabytes: 7, threaded: false, label: "ligero" },
];

// What we actually pick by default, and it is NOT the strongest build. Measured
// in-browser at depth 18 over five positions on a 4-core machine:
//
//   lite, 1 thread     1734 ms/position
//   lite, 3 threads    1980 ms/position   ← threads made it SLOWER
//   full, 3 threads    4031 ms/position   ← 2.3x for the big net
//
// Two things that measurement settles. Multi-threading doesn't pay here: WASM
// thread coordination on four shared cores costs more than it returns. And the
// full net costs more than twice the time for evaluation differences around 0.4
// pawns — while the SAME time budget spent on depth is what actually moves move
// classifications, because those come from tactics the search either sees or
// doesn't.
//
// So the default is the fastest build and the budget goes into depth. The
// stronger builds stay shipped and reachable via forceBuild(), because this
// ordering is a measurement on one machine, not a law.
const AUTO_ORDER: BuildId[] = ["lite-st", "lite-mt", "full-st", "full-mt"];

export const FLOOR: BuildId = "lite-st";
const DEMOTED_KEY = "bv_engine_failed";
const FORCED_KEY = "bv_engine_force";

const buildById = (id: BuildId) => BUILDS.find((b) => b.id === id) ?? BUILDS[BUILDS.length - 1];

/** Builds that have already failed to load on this device. */
function demoted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DEMOTED_KEY) ?? "[]") as string[]);
  } catch { return new Set(); }
}

/** Records a build as unusable here, so the next analysis doesn't retry it. */
export function markBuildFailed(id: BuildId): void {
  try {
    const set = demoted();
    set.add(id);
    localStorage.setItem(DEMOTED_KEY, JSON.stringify([...set]));
  } catch { /* private mode — we just retry next time */ }
}

/** Manual override, for testing or for a user who knows what they want. */
export function forceBuild(id: BuildId | null): void {
  try {
    if (id) localStorage.setItem(FORCED_KEY, id);
    else localStorage.removeItem(FORCED_KEY);
  } catch { /* ignore */ }
}

export interface DeviceCapabilities {
  isolated: boolean;      // SharedArrayBuffer available → threaded builds possible
  cores: number;
  bigDownloadOk: boolean; // is a 108MB download reasonable here?
  reason: string;         // why the big download was ruled in or out, for the UI
}

export function detectCapabilities(): DeviceCapabilities {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const cores = nav?.hardwareConcurrency ?? 1;

  // crossOriginIsolated is the honest answer to "can I use threads": it accounts
  // for the COOP/COEP headers actually arriving, not just being configured.
  const isolated =
    typeof globalThis.crossOriginIsolated === "boolean"
      ? globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined"
      : false;

  // Network Information API — present on Chromium, absent elsewhere. Absent is
  // treated as "unknown", not as "fine", because guessing wrong here means a
  // 108MB download over a metered connection.
  const conn = (nav as unknown as {
    connection?: { effectiveType?: string; saveData?: boolean };
  } | undefined)?.connection;

  // Device Memory API, also Chromium-only and also optional. Read defensively so
  // a missing or renamed property just reads as unknown.
  const memGb = (nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory;

  let bigDownloadOk = true;
  let reason = "";

  if (conn?.saveData) {
    bigDownloadOk = false;
    reason = "el dispositivo pide ahorrar datos";
  } else if (conn?.effectiveType && !["4g", "wifi"].includes(conn.effectiveType)) {
    bigDownloadOk = false;
    reason = `la conexión es ${conn.effectiveType}`;
  } else if (typeof memGb === "number" && memGb < 4) {
    bigDownloadOk = false;
    reason = `el dispositivo declara ${memGb} GB de memoria`;
  } else if (cores <= 2) {
    // A 108MB net on two cores spends longer decoding the engine than the
    // stronger evaluation saves.
    bigDownloadOk = false;
    reason = `solo hay ${cores} núcleo${cores === 1 ? "" : "s"}`;
  } else {
    reason = conn?.effectiveType
      ? `conexión ${conn.effectiveType}, ${cores} núcleos`
      : `${cores} núcleos`;
  }

  return { isolated, cores, bigDownloadOk, reason };
}

export interface Choice {
  build: Build;
  capabilities: DeviceCapabilities;
  forced: boolean;
}

/** The strongest build this device can actually run right now. */
export function chooseBuild(): Choice {
  const capabilities = detectCapabilities();

  let forcedId: string | null = null;
  try { forcedId = localStorage.getItem(FORCED_KEY); } catch { /* ignore */ }
  if (forcedId && BUILDS.some((b) => b.id === forcedId)) {
    return { build: buildById(forcedId as BuildId), capabilities, forced: true };
  }

  const failed = demoted();
  for (const id of AUTO_ORDER) {
    const build = buildById(id);
    if (failed.has(build.id)) continue;
    if (build.threaded && !capabilities.isolated) continue;
    if (build.megabytes > 50 && !capabilities.bigDownloadOk) continue;
    return { build, capabilities, forced: false };
  }
  // Everything ruled out — the floor build runs anywhere, so try it regardless
  // rather than refusing to analyse at all.
  return { build: buildById(FLOOR), capabilities, forced: false };
}

/**
 * The next build to try after `id` failed. Falls back along the SIZE ladder, not
 * the strength one: if a build failed it was probably too big for this device, so
 * the useful next attempt is a smaller one.
 */
export function fallbackAfter(id: BuildId): Build | null {
  const bySize: BuildId[] = ["full-mt", "full-st", "lite-mt", "lite-st"];
  const i = bySize.indexOf(id);
  if (i < 0 || i >= bySize.length - 1) return null;
  return buildById(bySize[i + 1]);
}

/** Threads to give the engine: leave one core for the page itself. */
export const threadsFor = (build: Build, cores: number): number =>
  build.threaded ? Math.max(1, Math.min(8, cores - 1)) : 1;
