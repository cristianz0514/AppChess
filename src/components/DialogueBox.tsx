"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { DialogueLine } from "@/lib/champions";
import { ChampionAvatar } from "./ChampionAvatar";

interface Props {
  lines: DialogueLine[];
  playerInitials: string;
  otherInitials: string;
  otherColor: string;
  onDone: () => void;
}

// One-line-at-a-time speech-bubble sequence — tap/click to advance, like a
// visual-novel dialogue box. Bubbles alternate side by DialogueLine.side so
// the conversation reads like two people talking, not a wall of text.
export function DialogueBox({ lines, playerInitials, otherInitials, otherColor, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const line = lines[idx];
  if (!line) return null;
  const isLast = idx === lines.length - 1;

  function advance() {
    if (isLast) onDone();
    else setIdx((i) => i + 1);
  }

  const isPlayer = line.side === "player";

  return (
    <button
      onClick={advance}
      className="w-full text-left rounded-2xl border p-4 transition active:scale-[0.99]"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className={`flex items-start gap-3 ${isPlayer ? "flex-row-reverse" : ""}`}>
        <ChampionAvatar
          initials={isPlayer ? playerInitials : otherInitials}
          color={isPlayer ? "var(--bv-purple)" : otherColor}
          size={40}
        />
        <div className={`flex-1 min-w-0 ${isPlayer ? "text-right" : ""}`}>
          <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: "var(--muted-foreground)" }}>
            {line.speaker}
          </p>
          <p className="text-sm leading-relaxed">{line.text}</p>
        </div>
      </div>
      <div className={`flex items-center gap-1 mt-3 text-[11px] font-semibold ${isPlayer ? "justify-start" : "justify-end"}`}
        style={{ color: "var(--bv-purple)" }}>
        {isLast ? "Continuar" : "Siguiente"} <ChevronRight size={13} />
        <span className="text-muted-foreground font-normal ml-1">{idx + 1}/{lines.length}</span>
      </div>
    </button>
  );
}
