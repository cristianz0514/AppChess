"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, subscribeMuted, toggleMuted, play } from "@/lib/sound";

// Same mute control as the analysis board's header — practice mode plays the
// same move/error/brilliant sounds, so it needs the same way to silence them.
export function SoundToggle() {
  // Server snapshot is `true` (sound on), the same default the first client render uses.
  const on = useSyncExternalStore(subscribeMuted, () => !isMuted(), () => true);

  return (
    <button
      onClick={() => { const nowOn = !toggleMuted(); if (nowOn) play("move"); }}
      aria-label={on ? "Silenciar sonidos" : "Activar sonidos"}
      title={on ? "Silenciar sonidos" : "Activar sonidos"}
      className="w-9 h-9 flex items-center justify-center rounded-full border transition-colors hover:bg-muted/40"
      style={{ borderColor: "var(--border)", color: on ? "var(--bv-purple)" : "var(--muted-foreground)" }}>
      {on ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  );
}
