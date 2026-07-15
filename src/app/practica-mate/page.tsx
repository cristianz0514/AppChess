import { CheckCircle2 } from "lucide-react";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getRoadTrip } from "@/services/puzzleProgress";
import { PuzzleRoadTrip } from "@/components/PuzzleRoadTrip";
import { PracticeSeeder, BackgroundSeeder, AutoMineMates } from "@/components/PracticeSeeder";
import { BackButton } from "@/components/BackButton";
import { FAST_TARGET, MATE_LEVELS, type MateIn } from "@/lib/puzzleConstants";

export const metadata = { title: "Practica el Mate" };

// A dedicated full-page "mode" — not wrapped in the normal AppLayout shell
// (sidebar/bottom nav) — same reasoning as /blunders/[id]: entering an
// immersive view should feel like leaving the dashboard chrome behind, not
// like a section still living inside it.
export default async function PracticeMatePage() {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) return null;

  const worlds = await getRoadTrip(userId);
  const counts = Object.fromEntries(
    MATE_LEVELS.map((l) => [l, worlds.find((w) => w.mateIn === l)?.nodes.length ?? 0]),
  ) as Record<MateIn, number>;
  const personalCount = worlds.reduce((s, w) => s + w.nodes.filter((n) => n.personal).length, 0);
  const totalSolved = worlds.reduce((s, w) => s + w.solvedCount, 0);
  const totalNodes = worlds.reduce((s, w) => s + w.nodes.length, 0);
  const pct = totalNodes > 0 ? Math.round((totalSolved / totalNodes) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard" />
          <span className="font-bold text-base tracking-tight">Practica el Mate</span>
        </div>
        {totalNodes > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-3 py-1 rounded-full"
              style={{ background: "oklch(0.61 0.22 285 / 0.14)", color: "var(--bv-purple)" }}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              <span className="text-[11px] font-bold tabular-nums">{totalSolved}/{totalNodes}</span>
            </div>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--bv-purple)" }}>{pct}%</span>
          </div>
        )}
      </header>

      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto pb-8">
        {counts[1] < FAST_TARGET ? (
          <PracticeSeeder />
        ) : (
          <>
            <PuzzleRoadTrip worlds={worlds} />
            <BackgroundSeeder counts={counts} />
            <AutoMineMates personalCount={personalCount} />
          </>
        )}
      </main>
    </div>
  );
}
