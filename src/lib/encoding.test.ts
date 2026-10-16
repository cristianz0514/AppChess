import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Text saved with the wrong encoding shows up on screen as an accented letter turned into two
// odd characters (an "i" with an acute accent coming out as a capital A with a tilde plus a soft
// hyphen, an em dash coming out as three symbols). It happened once in a component and nothing
// flagged it, because the code still compiles. This reads every source file for the tell-tale
// pairs. The pairs are compared by character code so this file never contains one itself.
const SOURCE_DIR = join(__dirname, "..");

// What UTF-8 bytes 0x80-0x9F turn into when read as Windows-1252.
const CP1252_HIGH = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017D,
  0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

export function hasMojibake(line: string): boolean {
  for (let i = 0; i + 1 < line.length; i++) {
    const lead = line.charCodeAt(i);
    const next = line.charCodeAt(i + 1);
    const continuation = (next >= 0xA0 && next <= 0xBF) || CP1252_HIGH.has(next);
    if ((lead === 0xC3 || lead === 0xE2) && continuation) return true;
  }
  return false;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

describe("source text encoding", () => {
  it("recognises the pairs, and leaves ordinary accents alone", () => {
    const garbledI = String.fromCharCode(0x41, 0x71, 0x75, 0xC3, 0xAD); // UTF-8 "i" read as Windows-1252
    const garbledDash = String.fromCharCode(0xE2, 0x20AC, 0x201D); // UTF-8 em dash read as Windows-1252
    expect(hasMojibake(garbledI)).toBe(true);
    expect(hasMojibake(garbledDash)).toBe(true);
    expect(hasMojibake("Aquí vas — ¿listo? Campeón, año, ñandú")).toBe(false);
  });

  it("has no text that was saved with the wrong encoding", () => {
    const bad = sourceFiles(SOURCE_DIR).flatMap((file) =>
      readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, i) =>
        hasMojibake(line) ? [`${file.slice(SOURCE_DIR.length + 1)}:${i + 1}: ${line.trim().slice(0, 80)}`] : []),
    );
    expect(bad).toEqual([]);
  });
});
