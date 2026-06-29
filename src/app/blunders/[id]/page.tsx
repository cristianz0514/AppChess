import { notFound } from "next/navigation";
import Link from "next/link";
import { getUsername } from "@/lib/getUsername";
import { supabase } from "@/lib/supabase";
import { GameViewer } from "@/components/GameViewer";
import { ChevronLeft, Share2, Settings } from "lucide-react";
import type { Game } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blunder?: string }>;
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
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.115 0.025 265)" }}>

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "oklch(0.115 0.025 265)", borderColor: "oklch(0.25 0.04 265)" }}>
        <div className="flex items-center gap-3">
          <Link href="/blunders" className="p-2 -ml-2 rounded-full transition-colors hover:bg-white/10">
            <ChevronLeft size={20} />
          </Link>
          <span className="font-bold text-base tracking-tight" style={{ color: "var(--bv-purple)" }}>
            BlunderVision AI
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Share2 size={18} className="text-muted-foreground" />
          </button>
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Settings size={18} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 pt-16 pb-24 px-4 max-w-lg mx-auto w-full">
        <GameViewer
          pgn={game.pgn}
          playedAs={game.played_as as "white" | "black"}
          dbMoves={dbMoves}
          jumpToBlunder={blunder === "1"}
          gameResult={game.result as Game["result"]}
          opening={game.opening ?? "Apertura Desconocida"}
          accuracy={game.accuracy}
        />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 border-t backdrop-blur-xl"
        style={{ background: "oklch(0.115 0.025 265 / 0.85)", borderColor: "oklch(0.25 0.04 265)" }}>
        {[
          { label: "Analizar",  emoji: "📊", active: true },
          { label: "Jugadas",   emoji: "☰",  active: false },
          { label: "Consejos",  emoji: "🧠", active: false },
          { label: "Motor",     emoji: "⚙️", active: false },
        ].map(({ label, emoji, active }) => (
          <button key={label}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-colors"
            style={active ? { background: "oklch(0.61 0.22 285 / 0.3)", color: "var(--bv-purple)" } : { color: "var(--muted-foreground)" }}>
            <span className="text-xl leading-none">{emoji}</span>
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}
