"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles } from "lucide-react";
import type { Champion, Chapter } from "@/lib/champions";
import { DialogueBox } from "./DialogueBox";
import { ChampionBattle, type BattleResult } from "./ChampionBattle";

interface Props {
  champion: Champion;
  chapter: Chapter;
}

type Stage = "intro" | "battle" | "outro" | "done";

// Orchestrates one chapter's flow: intro dialogue -> live battle -> outro
// dialogue (branches on the result) -> completion screen with a replay
// option. Fully client-side / stateless across visits for this first
// chapter — no progress is persisted yet.
export function ChapterExperience({ champion, chapter }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<BattleResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  function handleGameOver(r: BattleResult) {
    setResult(r);
    setStage("outro");
  }

  function playAgain() {
    setResult(null);
    setAttempt((a) => a + 1);
    setStage("battle");
  }

  const outroLines = result === "win" ? chapter.outroWin : chapter.outroLoseOrDraw;

  return (
    <div className="space-y-3">
      <div className="text-center px-1 space-y-1">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: champion.color }}>
          {champion.name}
        </p>
        <h1 className="font-display text-xl font-bold text-balance">{chapter.title}</h1>
        <p className="text-[11px] text-muted-foreground italic">{champion.disclaimer}</p>
      </div>

      {stage === "intro" && (
        <DialogueBox
          lines={chapter.intro}
          playerInitials={champion.initials}
          otherInitials={chapter.opponentInitials}
          otherColor={champion.color}
          onDone={() => setStage("battle")}
        />
      )}

      {stage === "battle" && (
        <ChampionBattle
          key={attempt}
          playerColor={chapter.playerColor}
          opponentName={chapter.opponentName}
          eloTarget={chapter.eloTarget}
          onGameOver={handleGameOver}
        />
      )}

      {stage === "outro" && (
        <div className="space-y-3">
          <div className="rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center gap-2 justify-center"
            style={{
              background: result === "win" ? "oklch(0.77 0.17 177 / 0.12)" : "oklch(0.70 0.18 50 / 0.12)",
              color: result === "win" ? "var(--bv-green)" : "var(--bv-orange)",
            }}>
            {result === "win" ? "¡Ganaste la partida!" : result === "draw" ? "Tablas — casi." : "Esta vez no."}
          </div>
          <DialogueBox
            lines={outroLines}
            playerInitials={champion.initials}
            otherInitials={chapter.opponentInitials}
            otherColor={champion.color}
            onDone={() => setStage("done")}
          />
        </div>
      )}

      {stage === "done" && (
        <div className="space-y-3">
          {result !== "win" && (
            <button onClick={playAgain}
              className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <RotateCcw size={16} /> Intentar de nuevo
            </button>
          )}
          <button
            onClick={() => router.push("/campeones")}
            className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            style={{ background: champion.color }}>
            <Sparkles size={16} /> Volver a Campeones
          </button>
        </div>
      )}
    </div>
  );
}
