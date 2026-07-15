"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles } from "lucide-react";
import type { Champion, Chapter } from "@/lib/champions";
import { DialogueBox } from "./DialogueBox";
import { ChampionBattle, type BattleResult } from "./ChampionBattle";
import { SceneBackground } from "./SceneBackground";

interface Props {
  champion: Champion;
  chapter: Chapter;
  userId: string;
}

type Stage = "intro" | "battle" | "outro" | "done";

// Family members share one warm, neutral portrait color — distinct from the
// champion's own brand color, so the cast doesn't all read as "the same
// person" in different scenes.
const FAMILY_COLOR = "oklch(0.5 0.05 50)";

// Orchestrates one chapter's flow: intro dialogue -> live battle -> outro
// dialogue (branches on the result) -> completion screen with a replay
// option. Progress is saved once per chapter reach of "done" (whatever the
// result — a later retry-and-win overwrites an earlier loss, see
// championProgress.ts), not on every attempt.
export function ChapterExperience({ champion, chapter, userId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<BattleResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const savedFor = useRef<number | null>(null);

  function handleGameOver(r: BattleResult) {
    setResult(r);
    setStage("outro");
  }

  // Fires once per attempt when the player reaches the completion screen —
  // guarded by `savedFor` so re-rendering "done" (e.g. React strict-mode
  // double-invoke, or revisiting state) never double-POSTs.
  useEffect(() => {
    if (stage !== "done" || !result || savedFor.current === attempt) return;
    savedFor.current = attempt;
    fetch("/api/champions/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, championId: champion.id, chapterId: chapter.id, result }),
    }).catch(() => {});
  }, [stage, result, attempt, userId, champion.id, chapter.id]);

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

      {/* The scene backdrop grounds the story somewhere (a home, not a blank
          card) — it sits behind dialogue AND the battle, staying present
          through the whole chapter. */}
      <div className="relative -mx-4 rounded-2xl overflow-hidden" style={{ minHeight: 420 }}>
        <SceneBackground variant={chapter.scene} />
        <div className="relative z-10 px-4 py-4 space-y-3">
          {stage === "intro" && (
            <DialogueBox
              lines={chapter.intro}
              playerPortrait={chapter.playerPortrait}
              playerColor={champion.color}
              otherColor={FAMILY_COLOR}
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
                  background: result === "win" ? "oklch(0.77 0.17 177 / 0.85)" : "oklch(0.70 0.18 50 / 0.85)",
                  color: "#1a1208",
                  animation: "bvFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
                }}>
                {result === "win" ? "¡Ganaste la partida!" : result === "draw" ? "Tablas — casi." : "Esta vez no."}
              </div>
              <DialogueBox
                lines={outroLines}
                playerPortrait={chapter.playerPortrait}
                playerColor={champion.color}
                otherColor={FAMILY_COLOR}
                onDone={() => setStage("done")}
              />
            </div>
          )}

          {stage === "done" && (
            <div className="space-y-3" style={{ animation: "bvFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
              {result !== "win" && (
                <button onClick={playAgain}
                  className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.98] backdrop-blur-sm"
                  style={{ background: "oklch(0.18 0.02 60 / 0.72)", border: "1px solid rgba(255,255,255,.15)", color: "#fff" }}>
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
      </div>
    </div>
  );
}
