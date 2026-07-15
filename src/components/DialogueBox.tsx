"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { DialogueLine } from "@/lib/champions";
import { CharacterPortrait } from "./CharacterPortrait";

interface Props {
  lines: DialogueLine[];
  playerPortrait: NonNullable<DialogueLine["portrait"]>;
  playerColor: string;
  otherColor: string;
  onDone: () => void;
}

// One-line-at-a-time sequence — tap/click to advance, like a visual-novel
// dialogue box. Narration (no `portrait`) renders as an italic scene caption
// with no bubble or face, deliberately different from character lines, so
// "the narrator talking" reads as narration rather than a third person in
// the room.
export function DialogueBox({ lines, playerPortrait, playerColor, otherColor, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const line = lines[idx];
  if (!line) return null;
  const isLast = idx === lines.length - 1;
  const isNarration = !line.portrait;
  const isPlayer = line.side === "player";

  function advance() {
    if (isLast) onDone();
    else setIdx((i) => i + 1);
  }

  return (
    <button
      onClick={advance}
      className="relative z-10 w-full text-left rounded-2xl border p-4 transition active:scale-[0.99] backdrop-blur-sm overflow-hidden"
      style={{ background: "oklch(0.18 0.02 60 / 0.72)", borderColor: "rgba(255,255,255,.12)", animation: "bvFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      {/* Keyed by idx so each new line mounts fresh and replays the entrance
          animation — advancing the conversation should feel like someone
          new steps up to speak, not a static text swap. */}
      <div key={idx} style={{ animation: "bvFadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
        {isNarration ? (
          <p className="font-display italic text-sm leading-relaxed text-center px-2" style={{ color: "rgba(255,255,255,.85)" }}>
            {line.text}
          </p>
        ) : (
          <div className={`flex items-start gap-3 ${isPlayer ? "flex-row-reverse" : ""}`}>
            <CharacterPortrait variant={line.portrait!} bgColor={isPlayer ? playerColor : otherColor} size={40} idle />
            <div className={`flex-1 min-w-0 ${isPlayer ? "text-right" : ""}`}>
              <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: "rgba(255,255,255,.55)" }}>
                {line.speaker}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.95)" }}>{line.text}</p>
            </div>
          </div>
        )}
      </div>
      <div className={`flex items-center gap-1 mt-3 text-[11px] font-semibold ${isNarration ? "justify-center" : isPlayer ? "justify-start" : "justify-end"}`}
        style={{ color: "var(--bv-purple)" }}>
        {isLast ? "Continuar" : "Siguiente"} <ChevronRight size={13} />
        <span className="font-normal ml-1" style={{ color: "rgba(255,255,255,.5)" }}>{idx + 1}/{lines.length}</span>
      </div>
    </button>
  );
}
