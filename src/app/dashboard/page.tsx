import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserId, getDashboardStats, getTopOpenings } from "@/services/dashboardData";
import { getInsights } from "@/services/insightsGenerator";
import { OpeningWinrateChart } from "@/components/charts/OpeningWinrateChart";
import { ResultsPieChart } from "@/components/charts/ResultsPieChart";
import { InsightsCard } from "@/components/InsightsCard";

interface Props {
  searchParams: Promise<{ username?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { username } = await searchParams;

  if (!username) redirect("/");

  const userId = await getUserId(username);
  if (!userId) redirect("/");

  const [stats, openings, insights] = await Promise.all([
    getDashboardStats(userId),
    getTopOpenings(userId),
    getInsights(userId),
  ]);

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold capitalize">{username}</h1>
          <p className="text-xs text-muted-foreground">Last 50 games</p>
        </div>

        {/* 1. Rating card */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">Current Rating</p>
          <p className="text-5xl font-bold tracking-tight">
            {stats.currentRating ?? "—"}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Win rate</p>
              <p className="text-xl font-semibold mt-0.5">{stats.winrate}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accuracy</p>
              <p className="text-xl font-semibold mt-0.5">
                {stats.avgAccuracy ? `${stats.avgAccuracy}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Games</p>
              <p className="text-xl font-semibold mt-0.5">{stats.totalGames}</p>
            </div>
          </div>
        </div>

        {/* Win / Loss / Draw strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Wins",   value: stats.wins,   color: "text-green-500" },
            { label: "Losses", value: stats.losses,  color: "text-red-500"   },
            { label: "Draws",  value: stats.draws,   color: "text-yellow-500"},
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 shadow-sm text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 2. AI Coach card */}
        <InsightsCard insights={insights} username={username} />

        {/* 3. Opening performance */}
        <OpeningWinrateChart openings={openings} />

        {openings.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-medium">Top Openings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Opening</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">G</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">W</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">L</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Win%</th>
                  </tr>
                </thead>
                <tbody>
                  {openings.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 active:bg-accent/40 transition-colors">
                      <td className="px-4 py-3 font-medium truncate max-w-[140px]">{o.opening_name}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{o.games_played}</td>
                      <td className="px-4 py-3 text-right text-green-500">{o.wins}</td>
                      <td className="px-4 py-3 text-right text-red-500">{o.losses}</td>
                      <td className="px-4 py-3 text-right font-medium">{o.winrate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Accuracy / results chart */}
        <ResultsPieChart stats={stats} />

      </div>
    </AppLayout>
  );
}
