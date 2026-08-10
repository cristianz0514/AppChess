import { notFound } from "next/navigation";
import { getUsername } from "@/lib/getUsername";
import { supabase } from "@/lib/supabase";
import { GameViewer } from "@/components/GameViewer";
import { GameAutoAnalyzer } from "@/components/GameAutoAnalyzer";
import { ShareGameButton } from "@/components/ShareGameButton";
import { BackButton } from "@/components/BackButton";
import { translateOpening } from "@/lib/translateOpening";
import { getDashboardStats } from "@/services/dashboardData";
import type { Game } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blunder?: string; story?: string; coach?: string }>;
}

export default async function GameDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { blunder, story, coach } = await searchParams;
  await getUsername();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) notFound();

  // Player's average accuracy, for the "vs tu promedio" comparison.
  const stats = await getDashboardStats(game.user_id).catch(() => null);
  const avgAccuracy = stats?.avgAccuracy ?? null;

  // Include the AI coach explanation and `ply` (unambiguous per-move key)
  // when those columns exist; fall back cleanly to the base columns on
  // older schemas that haven't run those migrations yet.
  let moves: Array<Record<string, unknown>> | null = null;
  let explanationColumn = false;
  {
    // Widest first, dropping one optional column per rung: a database that has not run a
    // migration yet loses that column instead of losing the whole page. Each migration adds
    // a rung, and after `best_line` the nested if/else version was four levels deep with
    // its braces off the indentation — so it becomes the list it always was.
    //
    // `best_line` is the evidence behind the comment's plan clause; `best_move` is what
    // keeps the viewer's arrow and the written comment pointing at the SAME move; `ply` is
    // the unambiguous row key; `explanation` is the comment itself. Newest and least
    // essential first.
    const BASE = "move_number, move, classification, centipawn_loss, evaluation";
    const RUNGS = [
      `${BASE}, explanation, ply, best_move, best_line`,
      `${BASE}, explanation, ply, best_move`,
      `${BASE}, explanation, ply`,
      `${BASE}, explanation`,
      BASE,
    ];
    for (const columns of RUNGS) {
      const r = await supabase.from("moves").select(columns)
        .eq("game_id", id).order("move_number", { ascending: true });
      if (r.error) continue;
      // A dynamic column list gives up supabase-js's inferred row type — it can no longer
      // know which columns came back. The shape is asserted right below in `dbMoves`, with
      // every optional column marked optional, which is what the rungs make it.
      moves = r.data as unknown as Array<Record<string, unknown>>;
      explanationColumn = columns.includes("explanation");
      break;
    }
  }

  const dbMoves = (moves ?? []) as Array<{
    move_number: number;
    move?: string | null;
    classification: string | null;
    centipawn_loss: number | null;
    evaluation: number | null;
    explanation?: string | null;
    ply?: number | null;
    best_move?: string | null;
    best_line?: string | null;
  }>;

  // A game analyzed before the coach existed: it has moves but no AI comments.
  // Regenerate once (behind the loading bar) so the coach shows inline per move.
  const NOTABLE = new Set(["blunder", "mistake", "inaccuracy", "brilliant", "great"]);
  const notableCount = dbMoves.filter((m) => m.classification && NOTABLE.has(m.classification)).length;
  const hasCoach = dbMoves.some((m) => m.explanation);
  // `coach=1` marks that a regeneration was already attempted this navigation —
  // prevents an infinite re-analyze loop if the comments can't be persisted.
  const needsCoach = coach !== "1" && explanationColumn && dbMoves.length > 0 && notableCount > 0 && !hasCoach;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <BackButton href="/blunders" />
          <span className="font-bold text-base tracking-tight" style={{ color: "var(--bv-purple)" }}>
            AnaliChess IA
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ShareGameButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto">
        {dbMoves.length === 0 ? (
          <GameAutoAnalyzer gameId={id} />
        ) : needsCoach ? (
          <GameAutoAnalyzer gameId={id} reanalyze />
        ) : (
          <GameViewer
            pgn={game.pgn}
            playedAs={game.played_as as "white" | "black"}
            dbMoves={dbMoves}
            jumpToBlunder={blunder === "1"}
            gameResult={game.result as Game["result"]}
            opening={translateOpening(game.opening)}
            accuracy={game.accuracy}
            avgAccuracy={avgAccuracy}
            gameId={id}
            autoStory={story === "1"}
          />
        )}
      </main>

    </div>
  );
}
