import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getRoadTrip } from "@/services/puzzleProgress";
import { PuzzleRoadTrip } from "@/components/PuzzleRoadTrip";
import { PracticeSeeder, BackgroundSeeder, AutoMineMates } from "@/components/PracticeSeeder";
import { FAST_TARGET } from "@/lib/puzzleConstants";

export const metadata = { title: "Practica el Mate" };

export default async function PracticeMatePage() {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) return null;

  const worlds = await getRoadTrip(userId);
  const mate1Count = worlds.find((w) => w.mateIn === 1)?.nodes.length ?? 0;
  const mate2Count = worlds.find((w) => w.mateIn === 2)?.nodes.length ?? 0;
  const personalCount = worlds.reduce((s, w) => s + w.nodes.filter((n) => n.personal).length, 0);

  // Only wait on a SMALL fast batch of Mate en 1 — the rest of the road trip
  // (the remainder of Mate en 1, and all of Mate en 2) fills in the background
  // via BackgroundSeeder while the player is already solving puzzles.
  return (
    <AppLayout username={username}>
      <div className="max-w-lg mx-auto" style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
        {mate1Count < FAST_TARGET ? (
          <PracticeSeeder />
        ) : (
          <>
            <PuzzleRoadTrip worlds={worlds} />
            <BackgroundSeeder mate1Count={mate1Count} mate2Count={mate2Count} />
            <AutoMineMates personalCount={personalCount} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
