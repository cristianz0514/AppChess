import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getRoadTrip } from "@/services/puzzleProgress";
import { PuzzleSolver } from "@/components/PuzzleSolver";
import { SoundToggle } from "@/components/SoundToggle";

interface Props {
  params: Promise<{ id: string }>;
}

// A dedicated full-page view for one puzzle — matches the /blunders/[id]
// pattern (fixed header with back chevron, own scroll area) instead of a
// bottom sheet docked over the road trip, so entering an exercise feels like
// opening a real view rather than a panel stuck at the bottom of the screen.
export default async function PuzzlePage({ params }: Props) {
  const { id } = await params;
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) redirect("/practica-mate");

  const worlds = await getRoadTrip(userId);

  let nodeIndex = -1;
  let worldMateIn: 1 | 2 = 1;
  let nextNodeId: string | null = null;
  const node = (() => {
    for (const world of worlds) {
      const idx = world.nodes.findIndex((n) => n.id === id);
      if (idx === -1) continue;
      nodeIndex = idx;
      worldMateIn = world.mateIn;
      nextNodeId = world.nodes[idx + 1]?.id ?? null;
      return world.nodes[idx];
    }
    return null;
  })();

  // Unknown id, or a node the player hasn't unlocked yet — send them back to
  // the road trip rather than letting a direct URL skip the progression.
  if (!node || node.state === "locked") redirect("/practica-mate");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <Link href="/practica-mate" className="p-2 -ml-2 rounded-full transition-colors hover:bg-muted">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Mundo {worldMateIn}</p>
            <span className="font-bold text-sm tracking-tight">Ejercicio {nodeIndex + 1}</span>
          </div>
        </div>
        <SoundToggle />
      </header>

      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto">
        <PuzzleSolver node={node} nextNodeId={nextNodeId} />
      </main>
    </div>
  );
}
