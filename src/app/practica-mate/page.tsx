import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getRoadTrip } from "@/services/puzzleProgress";
import { PuzzleRoadTrip } from "@/components/PuzzleRoadTrip";
import { PracticeSeeder, AutoMineMates } from "@/components/PracticeSeeder";

export const metadata = { title: "Practica el Mate" };

export default async function PracticeMatePage() {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) return null;

  const worlds = await getRoadTrip(userId);
  const totalPuzzles = worlds.reduce((s, w) => s + w.nodes.length, 0);
  const personalCount = worlds.reduce((s, w) => s + w.nodes.filter((n) => n.personal).length, 0);

  return (
    <AppLayout username={username}>
      <div className="max-w-lg mx-auto" style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
        {totalPuzzles === 0 ? (
          <PracticeSeeder />
        ) : (
          <>
            <PuzzleRoadTrip worlds={worlds} />
            <AutoMineMates personalCount={personalCount} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
