"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles, Trophy, XCircle, Handshake, Search, ChevronRight } from "lucide-react";
import type { Champion, Chapter } from "@/lib/champions";
import type { PortraitVariant } from "./CharacterPortrait";
import { CharacterPortrait } from "./CharacterPortrait";
import { DialogueBox } from "./DialogueBox";
import { ChampionBattle, type BattleResult } from "./ChampionBattle";
import { SceneBackground } from "./SceneBackground";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Props {
  champion: Champion;
  chapter: Chapter;
  userId: string;
}

// "result" is a new stage — the story used to continue straight into the
// outro dialogue the instant a game ended, with no room to register the
// win/loss or to send the game to analysis.
type Stage = "intro" | "battle" | "result" | "outro" | "done";

// Family members share one warm, neutral portrait color — distinct from the
// champion's own brand color, so the cast doesn't all read as "the same
// person" in different scenes.
const FAMILY_COLOR = "oklch(0.5 0.05 50)";

const RESULT_COPY: Record<BattleResult, { title: string; color: string; Icon: typeof Trophy }> = {
  win:  { title: "¡Ganaste la partida!", color: "var(--bv-green)",  Icon: Trophy },
  loss: { title: "Esta vez no.",         color: "var(--bv-red)",    Icon: XCircle },
  draw: { title: "Tablas — casi.",       color: "var(--bv-orange)", Icon: Handshake },
};

// Dedicated win/lose expression art (vs. the generic trophy/X icon) — only
// exists for the child-era Judit portrait so far, so this stays a lookup
// rather than a blanket assumption every playerPortrait has a pair.
const EXPRESSION_PORTRAIT: Partial<Record<PortraitVariant, { win: PortraitVariant; loss: PortraitVariant }>> = {
  "judit-child": { win: "judit-victoria", loss: "judit-derrota" },
};

// Full-screen modal shown the instant a battle ends — before the story moves
// on, so the result actually registers, and with a way to send this exact
// game into the app's own analysis tool instead of it just vanishing.
function ResultModal({
  result, champion, chapter, userId, pgn, playerColor, onContinue,
}: {
  result: BattleResult;
  champion: Champion;
  chapter: Chapter;
  userId: string;
  pgn: string;
  playerColor: "white" | "black";
  onContinue: () => void;
}) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(false);
  const { title, color, Icon } = RESULT_COPY[result];
  const expressionSet = EXPRESSION_PORTRAIT[chapter.playerPortrait];
  const expressionVariant = result === "win" ? expressionSet?.win : result === "loss" ? expressionSet?.loss : undefined;
  // Was a plain div with role="dialog" and no actual focus behavior — Tab
  // could leave the modal for the (still-mounted) board behind it, nothing
  // moved focus in on open, Escape did nothing, and closing never gave focus
  // back to whatever had it before.
  const panelRef = useFocusTrap<HTMLDivElement>(true, onContinue);

  async function handleAnalyze() {
    setAnalyzeError(false);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/champions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, championId: champion.id, chapterId: chapter.id, pgn, playerColor, result }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.gameId) throw new Error();
      router.push(`/blunders/${data.gameId}`);
    } catch {
      setAnalyzeError(true);
      setAnalyzing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,9,15,0.6)", backdropFilter: "blur(3px)", animation: "bvFadeInUp 0.25s ease-out both" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className="deco-step w-full max-w-sm p-6 text-center space-y-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {expressionVariant ? (
          <div className="mx-auto" style={{ width: 112, height: 112 }}>
            <CharacterPortrait variant={expressionVariant} bgColor={`color-mix(in oklch, ${color} 20%, transparent)`} size={112} />
          </div>
        ) : (
          <div
            className="mx-auto flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, background: `color-mix(in oklch, ${color} 20%, transparent)` }}
          >
            <Icon size={32} style={{ color }} />
          </div>
        )}
        <div>
          <h2 className="font-deco text-2xl uppercase">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">Vs {chapter.opponentName} · ELO {chapter.eloTarget}</p>
        </div>

        {analyzeError && (
          <p className="text-xs" style={{ color: "var(--bv-red)" }}>
            No se pudo guardar la partida para análisis. Intenta de nuevo.
          </p>
        )}

        <div className="space-y-2 pt-1">
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="deco-step w-full py-3 font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: "var(--bv-electric)", color: "#fff" }}
          >
            {analyzing ? (
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
            ) : (
              <Search size={16} />
            )}
            {analyzing ? "Preparando análisis…" : "Analizar esta partida"}
          </button>
          <button
            onClick={onContinue}
            disabled={analyzing}
            className="deco-step w-full py-3 font-bold border transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Continuar la historia
          </button>
        </div>
      </div>
    </div>
  );
}

// Orchestrates one chapter's flow: intro dialogue -> live battle -> result
// modal (win/loss/draw + optional analysis) -> outro dialogue (branches on
// the result) -> completion screen with a replay option. Progress is saved
// as soon as the result is known (a later retry-and-win overwrites an
// earlier loss, see championProgress.ts), not on every attempt — moved up
// from "done" so it's still recorded even if the player leaves for analysis
// instead of continuing through to the outro.
export function ChapterExperience({ champion, chapter, userId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<BattleResult | null>(null);
  const [pgn, setPgn] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const savedFor = useRef<number | null>(null);

  function handleGameOver(r: BattleResult, gamePgn: string) {
    setResult(r);
    setPgn(gamePgn);
    setStage("result");
  }

  // Fires once per attempt as soon as the result is known — guarded by
  // `savedFor` so re-rendering (e.g. React strict-mode double-invoke) never
  // double-POSTs.
  useEffect(() => {
    if (stage !== "result" || !result || savedFor.current === attempt) return;
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

  // "Continuar" used to always dump the player back on the chapter list,
  // even right after winning — forcing an extra tap to reopen the list and
  // find the (now-unlocked) next chapter. When there IS a next chapter and
  // this one was won, jump straight into it instead.
  const chapterIndex = champion.chapters.findIndex((c) => c.id === chapter.id);
  const nextChapter = chapterIndex >= 0 ? champion.chapters[chapterIndex + 1] : undefined;

  // The dialogue box only ever mounts ONE line's <img> at a time (see
  // DialogueBox), so a character speaking for the first time — often deep
  // into the outro, well after the intro already downloaded — used to pop
  // its portrait in visibly, sometimes not even finishing before the player
  // taps past it. Preloading every portrait this chapter could show (intro +
  // BOTH outro branches, since the result isn't known yet + the win/loss
  // expression swap) the moment the chapter mounts gives the browser the
  // entire "reading the intro" window to fetch them in the background.
  const allPortraits = useMemo(() => {
    const set = new Set<PortraitVariant>();
    for (const line of [...chapter.intro, ...chapter.outroWin, ...chapter.outroLoseOrDraw]) {
      if (line.portrait) set.add(line.portrait);
    }
    const expressionSet = EXPRESSION_PORTRAIT[chapter.playerPortrait];
    if (expressionSet) { set.add(expressionSet.win); set.add(expressionSet.loss); }
    return [...set];
  }, [chapter]);

  return (
    <div className="space-y-3">
      <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        {allPortraits.map((variant) => (
          <CharacterPortrait key={variant} variant={variant} bgColor="transparent" size={1} />
        ))}
      </div>
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
              playerColor={champion.color}
              otherColor={FAMILY_COLOR}
              onDone={() => setStage("battle")}
            />
          )}

          {/* Kept mounted through "result" too — the board stays on its final
              position behind the modal instead of vanishing mid-celebration. */}
          {(stage === "battle" || stage === "result") && (
            <ChampionBattle
              key={attempt}
              playerColor={chapter.playerColor}
              opponentName={chapter.opponentName}
              eloTarget={chapter.eloTarget}
              onGameOver={handleGameOver}
            />
          )}

          {stage === "outro" && (
            <DialogueBox
              lines={outroLines}
              playerColor={champion.color}
              otherColor={FAMILY_COLOR}
              onDone={() => setStage("done")}
            />
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
              {result === "win" && nextChapter ? (
                <>
                  <button
                    onClick={() => router.push(`/campeones/${champion.id}/${nextChapter.id}`)}
                    className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                    style={{ background: champion.color }}>
                    Siguiente capítulo <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => router.push("/campeones")}
                    className="w-full py-3 rounded-2xl font-semibold text-sm border transition-transform active:scale-[0.98]"
                    style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff" }}>
                    Volver a Campeones
                  </button>
                </>
              ) : (
                <button
                  onClick={() => router.push("/campeones")}
                  className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                  style={{ background: champion.color }}>
                  <Sparkles size={16} /> Volver a Campeones
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {stage === "result" && result && (
        <ResultModal
          result={result}
          champion={champion}
          chapter={chapter}
          userId={userId}
          pgn={pgn}
          playerColor={chapter.playerColor}
          onContinue={() => setStage("outro")}
        />
      )}
    </div>
  );
}
