"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Shares the current game URL via the Web Share API, falling back to clipboard.
export function ShareGameButton() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "AnaliChess IA", url });
        return;
      }
    } catch { /* user cancelled or unsupported — fall through to clipboard */ }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — nothing else to do */ }
  }

  return (
    <button onClick={share} aria-label="Compartir partida"
      className="p-2 rounded-full hover:bg-white/10 transition-colors">
      {copied
        ? <Check size={18} style={{ color: "var(--bv-green)" }} />
        : <Share2 size={18} className="text-muted-foreground" />}
    </button>
  );
}
