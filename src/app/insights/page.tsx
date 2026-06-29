import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getInsights } from "@/services/insightsGenerator";
import { InsightsCard } from "@/components/InsightsCard";
import { Sparkles } from "lucide-react";
import type { Insight } from "@/types";

const categoryLabel: Record<Insight["category"], string> = {
  opening:           "Opening Habit",
  tactical:          "Tactical Pattern",
  time_management:   "Time Pressure",
  recurring_blunder: "Biggest Blindspot",
};

const coachRecommends = [
  { icon: "⏱", title: "Clock Discipline",  desc: "Practice with 10-min rapid games." },
  { icon: "♟", title: "Pawn Endgames",     desc: "Study king & pawn vs king positions." },
  { icon: "📖", title: "Opening Theory",    desc: "Review your critical openings." },
];

export default async function InsightsPage() {
  const username = await getUsername();
  const userId   = await getUserId(username);
  if (!userId) return null;

  const insights = await getInsights(userId);
  const featured = insights.find((i) => i.severity === "high") ?? insights[0] ?? null;
  const rest      = insights.filter((i) => i !== featured);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        {/* Greeting */}
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">AI Coach</p>
          <h1 className="text-xl font-bold mt-0.5">Good day, <span className="capitalize">{username}</span>.</h1>
          {insights.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              I&apos;ve analyzed your recent games. Here&apos;s what I found.
            </p>
          )}
        </div>

        {/* Daily Insight — featured */}
        {featured ? (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={13} style={{ color: "var(--bv-purple)" }} />
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Daily Insight</p>
              </div>
              <div className="flex gap-1">
                {(["opening", "tactical"] as Insight["category"][]).includes(featured.category) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "oklch(0.77 0.17 177 / 0.15)", color: "var(--bv-green)" }}>
                    {categoryLabel[featured.category]}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed font-medium">{featured.message}</p>
          </div>
        ) : (
          <InsightsCard insights={[]} username={username} />
        )}

        {/* Behavioral Patterns */}
        {rest.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Behavioral Patterns
            </p>
            <div className="divide-y divide-border">
              {rest.map((insight) => {
                const isPositive = insight.severity === "low";
                return (
                  <div key={insight.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-sm"
                      style={{ background: isPositive ? "oklch(0.77 0.17 177 / 0.12)" : "oklch(0.70 0.18 50 / 0.12)" }}>
                      {isPositive ? "📈" : "⚠️"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{categoryLabel[insight.category]}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Refresh button when no insights */}
        {insights.length === 0 && <InsightsCard insights={[]} username={username} />}

        {/* Coach Recommends */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Coach Recommends
          </p>
          <div className="divide-y divide-border">
            {coachRecommends.map((item) => (
              <div key={item.title} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted text-sm">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <span className="text-muted-foreground text-sm">›</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: "oklch(0.61 0.22 285 / 0.15)", border: "1px solid oklch(0.61 0.22 285 / 0.25)" }}>
          <p className="text-sm font-bold">Mastery is a Journey.</p>
          <p className="text-xs text-muted-foreground">Keep analyzing your games to unlock deeper insights.</p>
        </div>

      </div>
    </AppLayout>
  );
}
