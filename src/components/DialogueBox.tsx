"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { DialogueLine } from "@/lib/champions";
import { CharacterPortrait } from "./CharacterPortrait";
import { play } from "@/lib/sound";

interface Props {
  lines: DialogueLine[];
  playerColor: string;
  otherColor: string;
  onDone: () => void;
}

const MS_PER_CHAR = 28;

// A consistent "voice" pitch per speaker (Animal Crossing/EarthBound-style
// chatter, not real speech) — hashes the name so the same character always
// blips at the same pitch across the whole game without a manual lookup table.
function pitchForSpeaker(speaker: string): number {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  return 320 + (Math.abs(hash) % 200);
}

// One line's whole bubble — content AND footer live in the same component
// instance, mounted fresh per line via the parent's `key={idx}`. That's the
// point: an earlier version tracked the reveal count in the parent and reset
// it from an effect on idx change, which left a one-frame flash of the new
// line rendered at the OLD line's (larger) reveal count before the effect
// caught up. A fresh mount can't have stale state from a previous line.
function LineBubble({
  line, isLast, lineNumber, totalLines, playerColor, otherColor, onAdvance,
}: {
  line: DialogueLine;
  isLast: boolean;
  lineNumber: number;
  totalLines: number;
  playerColor: string;
  otherColor: string;
  onAdvance: () => void;
}) {
  const isNarration = !line.portrait;
  const isPlayer = line.side === "player";
  const text = line.text;

  // Plain state (not a ref) read once at mount — this only needs the value,
  // never a mutable box, and reading a ref during render is itself a lint
  // error (refs aren't meant to be render inputs).
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
  const [revealed, setRevealed] = useState(reducedMotion ? text.length : 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTyping = revealed < text.length;

  useEffect(() => {
    if (reducedMotion) return;
    const pitch = pitchForSpeaker(isNarration ? "narrador" : line.speaker) * (isNarration ? 0.75 : 1);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setRevealed(i);
      // Blip on non-space characters only, and only every other one — one
      // blip per letter reads as a buzz; one per syllable reads as chatter.
      const ch = text[i - 1];
      if (ch && ch !== " " && i % 2 === 0) play("blip", { pitch });
      if (i >= text.length && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, MS_PER_CHAR);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for this line's mount; a new line is a new mount, not a dep change
  }, []);

  function handleClick() {
    if (isTyping) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRevealed(text.length); // tap-to-skip — the reveal is a flourish, not a gate
      return;
    }
    onAdvance();
  }

  const revealedText = text.slice(0, revealed);

  return (
    <button
      onClick={handleClick}
      className="relative z-10 w-full text-left rounded-2xl border p-4 transition active:scale-[0.99] backdrop-blur-sm overflow-hidden"
      style={{
        background: "oklch(0.18 0.02 60 / 0.72)", borderColor: "rgba(255,255,255,.12)",
        // Replays on every line (this whole component remounts per line via
        // the parent's key={idx}) — advancing the conversation should feel
        // like someone new steps up to speak, not a static text swap.
        animation: "bvFadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      {/* aria-live: advancing the dialogue was silent for screen readers
          before — nothing announced that a new line had appeared. */}
      <div aria-live="polite" aria-atomic="true">
        {isNarration ? (
          <div className="space-y-2.5">
            {line.image && (
              // eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset
              <img
                src={line.image}
                alt=""
                className="w-full max-h-40 object-cover rounded-xl"
                style={{ boxShadow: "0 4px 16px -4px rgba(0,0,0,.5)" }}
              />
            )}
            <p className="font-display italic text-sm leading-relaxed text-center px-2" style={{ color: "rgba(255,255,255,.85)" }}>
              {revealedText}
            </p>
          </div>
        ) : (
          <div className={`flex items-center gap-3 ${isPlayer ? "flex-row-reverse" : ""}`}>
            {/* Bigger on purpose — big enough to actually read a character's
                expression and costume detail, not just recognize a color
                blob. Costs the text column some width; that's fine, it wraps
                to more lines instead. */}
            <CharacterPortrait variant={line.portrait!} bgColor={isPlayer ? playerColor : otherColor} size={88} idle />
            <div className={`flex-1 min-w-0 ${isPlayer ? "text-right" : ""}`}>
              <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: "rgba(255,255,255,.55)" }}>
                {line.speaker}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.95)" }}>{revealedText}</p>
            </div>
          </div>
        )}
      </div>
      <div className={`flex items-center gap-1 mt-3 text-[11px] font-semibold ${isNarration ? "justify-center" : isPlayer ? "justify-start" : "justify-end"}`}
        style={{ color: "var(--bv-electric)" }}>
        {isTyping ? "Toca para saltar" : isLast ? "Continuar" : "Siguiente"} <ChevronRight size={13} />
        <span className="font-normal ml-1" style={{ color: "rgba(255,255,255,.5)" }}>{lineNumber}/{totalLines}</span>
      </div>
    </button>
  );
}

// One-line-at-a-time sequence — tap/click to advance, like a visual-novel
// dialogue box. Narration (no `portrait`) renders as an italic scene caption
// with no bubble or face, deliberately different from character lines, so
// "the narrator talking" reads as narration rather than a third person in
// the room. Text reveals letter by letter with a per-character blip (see
// LineBubble) — the old version dumped the whole line in at once, silently,
// more like a subtitle than a character actually speaking.
export function DialogueBox({ lines, playerColor, otherColor, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const line = lines[idx];
  if (!line) return null;
  const isLast = idx === lines.length - 1;

  function advance() {
    if (isLast) onDone();
    else setIdx((i) => i + 1);
  }

  return (
    <LineBubble
      key={idx}
      line={line}
      isLast={isLast}
      lineNumber={idx + 1}
      totalLines={lines.length}
      playerColor={playerColor}
      otherColor={otherColor}
      onAdvance={advance}
    />
  );
}
