import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { supabase } from "@/lib/supabase";
import { GameViewer } from "@/components/GameViewer";
import type { Game, Move } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blunder?: string }>;
}

function resultLabel(result: Game["result"], playedAs: "white" | "black") {
  return result === "win" ? "Victory" : result === "loss" ? "Defeat" : "Draw";
}
function resultColor(result: Game["result"]) {
  return result === "win" ? "var(--bv-green)" : result === "loss" ? "var(--bv-red)" : "var(--bv-orange)";
}

export default async function GameDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { blunder } = await searchParams;
  const username = await getUsername();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) notFound();

  const { data: moves } = await supabase
    .from("moves")
    .select("move_number, classification")
    .eq("game_id", id)
    .order("move_number", { ascending: true });

  const dbMoves = (moves ?? []) as Array<{ move_number: number; classification: string | null }>;
  const blunderCount = dbMoves.filter((m) => m.classification === "blunder").length;
  const mistakeCount = dbMoves.filter((m) => m.classification === "mistake").length;

  const rating = game.played_as === "white" ? game.white_rating : game.black_rating;
  const oppRating = game.played_as === "white" ? game.black_rating : game.white_rating;

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Game Review
            </p>
            <h1 className="text-lg font-bold mt-0.5 leading-tight">{game.opening ?? "Unknown Opening"}</h1>
          </div>
          <span className="text-sm font-bold px-3 py-1 rounded-full mt-1"
            style={{ background: `${resultColor(game.result)}22`, color: resultColor(game.result) }}>
            {resultLabel(game.result, game.played_as)}
          </span>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Your Rating",  value: rating ?? "—",      color: "var(--foreground)" },
            { label: "Opp Rating",   value: oppRating ?? "—",   color: "var(--foreground)" },
            { label: "Accuracy",     value: game.accuracy ? `${game.accuracy}%` : "—", color: "var(--bv-green)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Error summary */}
        {(blunderCount > 0 || mistakeCount > 0) && (
          <div className="flex gap-3">
            {blunderCount > 0 && (
              <div className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">??</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--bv-red)" }}>{blunderCount} Blunder{blunderCount !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-muted-foreground">Critical errors</p>
                </div>
              </div>
            )}
            {mistakeCount > 0 && (
              <div className="flex-1 bg-card border border-border rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">?</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--bv-orange)" }}>{mistakeCount} Mistake{mistakeCount !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-muted-foreground">Significant errors</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Board + controls */}
        <GameViewer
          pgn={game.pgn}
          playedAs={game.played_as}
          dbMoves={dbMoves}
          jumpToBlunder={blunder === "1"}
        />

      </div>
    </AppLayout>
  );
}
