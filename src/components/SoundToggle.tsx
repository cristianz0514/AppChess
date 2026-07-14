"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, toggleMuted, play } from "@/lib/sound";

// Same mute control as the analysis board's header — practice mode plays the
// same move/error/brilliant sounds, so it needs the same way to silence them.
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(!isMuted()); }, []);

  return (
    <button
      onClick={() => { const nowOn = !toggleMuted(); setOn(nowOn); if (nowOn) play("move"); }}
      aria-label={on ? "Silenciar sonidos" : "Activar sonidos"}
      title={on ? "Silenciar sonidos" : "Activar sonidos"}
      className="w-9 h-9 flex items-center justify-center rounded-full border transition-colors hover:bg-muted/40"
      style={{ borderColor: "var(--border)", color: on ? "var(--bv-purple)" : "var(--muted-foreground)" }}>
      {on ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  );
}
