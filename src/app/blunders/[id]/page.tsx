import { notFound } from "next/navigation";
import Link from "next/link";
import { getUsername } from "@/lib/getUsername";
import { supabase } from "@/lib/supabase";
import { GameViewer } from "@/components/GameViewer";
import { GameAutoAnalyzer } from "@/components/GameAutoAnalyzer";
import { ShareGameButton } from "@/components/ShareGameButton";
import { ChevronLeft } from "lucide-react";
import { translateOpening } from "@/lib/translateOpening";
import type { Game } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blunder?: string }>;
}

export default async function GameDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { blunder } = await searchParams;
  await getUsername();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) notFound();

  const { data: moves } = await supabase
    .from("moves")
    .select("move_number, classification, centipawn_loss, evaluation")
    .eq("game_id", id)
    .order("move_number", { ascending: true });

  const dbMoves = (moves ?? []) as Array<{
    move_number: number;
    classification: string | null;
    centipawn_loss: number | null;
    evaluation: number | null;
  }>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <Link href="/blunders" className="p-2 -ml-2 rounded-full transition-colors hover:bg-muted">
            <ChevronLeft size={20} />
          </Link>
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
        ) : (
          <GameViewer
            pgn={game.pgn}
            playedAs={game.played_as as "white" | "black"}
            dbMoves={dbMoves}
            jumpToBlunder={blunder === "1"}
            gameResult={game.result as Game["result"]}
            opening={translateOpening(game.opening)}
            accuracy={game.accuracy}
            gameId={id}
          />
        )}
      </main>

    </div>
  );
}
