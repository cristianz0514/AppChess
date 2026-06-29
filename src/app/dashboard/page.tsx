import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserId, getDashboardStats, getTopOpenings } from "@/services/dashboardData";
import { getInsights } from "@/services/insightsGenerator";
import { InsightsCard } from "@/components/InsightsCard";
import { OpeningWinrateChart } from "@/components/charts/OpeningWinrateChart";
import type { Insight } from "@/types";

interface Props {
  searchParams: Promise<{ username?: string }>;
}

const categoryLabel: Record<Insight["category"], string> = {
  opening:           "Hábito de Apertura",
  tactical:          "Patrón Táctico",
  time_management:   "Gestión del Tiempo",
  recurring_blunder: "Error Recurrente",
};

export default async function DashboardPage({ searchParams }: Props) {
  const { username: usernameParam } = await searchParams;
  const cookieStore = await cookies();
  const username = usernameParam ?? cookieStore.get("bv_username")?.value;

  if (!username) redirect("/");

  const userId = await getUserId(username);
  if (!userId) redirect("/");

  const [stats, openings, insights] = await Promise.all([
    getDashboardStats(userId),
    getTopOpenings(userId),
    getInsights(userId),
  ]);

  const topInsight = insights.find((i) => i.severity === "high") ?? insights[0] ?? null;
  const remainingInsights = insights.filter((i) => i !== topInsight);

  const strongOpenings = openings.filter((o) => o.winrate >= 55).slice(0, 2);
  const weakOpenings   = openings.filter((o) => o.winrate < 45).slice(0, 2);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        {/* ── Rating row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Blitz Rating */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Rating
            </p>
            <p className="text-4xl font-bold tracking-tight" style={{ color: "var(--bv-green)" }}>
              {stats.currentRating ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">{stats.totalGames} games</p>
          </div>

          {/* Win / Loss record */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Results
            </p>
            <p className="text-2xl font-bold tracking-tight">
              <span style={{ color: "var(--bv-green)" }}>{stats.wins}W</span>
              {" – "}
              <span style={{ color: "var(--bv-red)" }}>{stats.losses}L</span>
            </p>
            <p className="text-xs text-muted-foreground">{stats.winrate}% win rate</p>
          </div>
        </div>

        {/* ── Stats strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Precisión", value: stats.avgAccuracy ? `${stats.avgAccuracy}%` : "—", color: "var(--bv-green)" },
            { label: "Tablas",    value: stats.draws,    color: "var(--bv-orange)" },
            { label: "Victorias", value: `${stats.winrate}%`, color: "var(--bv-green)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Biggest Blindspot (top insight) ─────────────────── */}
        {topInsight && (
          <div
            className="rounded-2xl p-4 space-y-3 border"
            style={{
              background: "oklch(0.20 0.06 50 / 0.25)",
              borderColor: "oklch(0.70 0.18 50 / 0.35)",
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-orange)" }}>
                {categoryLabel[topInsight.category]}
              </p>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: "oklch(0.70 0.18 50 / 0.2)" }}
              >
                ⚠️
              </div>
            </div>
            <p className="text-sm leading-relaxed font-medium">{topInsight.message}</p>
          </div>
        )}

        {/* ── No insights yet ──────────────────────────────────── */}
        {!topInsight && (
          <InsightsCard insights={[]} username={username} />
        )}

        {/* ── Recent Performance ──────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Rendimiento Reciente
          </p>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: "oklch(0.77 0.17 177 / 0.15)" }}>
                  📈
                </div>
                <div>
                  <p className="text-sm font-medium">Precisión</p>
                  <p className="text-xs text-muted-foreground">Últimas {stats.totalGames} partidas</p>
                </div>
              </div>
              <p className="text-sm font-bold" style={{ color: "var(--bv-green)" }}>
                {stats.avgAccuracy ? `${stats.avgAccuracy}%` : "—"}
              </p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: "oklch(0.63 0.23 25 / 0.15)" }}>
                  🎯
                </div>
                <div>
                  <p className="text-sm font-medium">Tasa de Victoria</p>
                  <p className="text-xs text-muted-foreground">{stats.wins}V · {stats.losses}D · {stats.draws}T</p>
                </div>
              </div>
              <p className="text-sm font-bold" style={{ color: stats.winrate >= 50 ? "var(--bv-green)" : "var(--bv-red)" }}>
                {stats.winrate}%
              </p>
            </div>
          </div>
        </div>

        {/* ── Openings ────────────────────────────────────────── */}
        {openings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                Aperturas
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Strong openings */}
              {strongOpenings.length > 0 && (
                <div className="bg-card border rounded-2xl p-3 space-y-2"
                  style={{ borderColor: "oklch(0.77 0.17 177 / 0.3)" }}>
                  <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-green)" }}>
                    Más Fuertes
                  </p>
                  {strongOpenings.map((o) => (
                    <div key={o.id}>
                      <p className="text-xs font-semibold truncate">{o.opening_name}</p>
                      <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}g</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Weak openings */}
              {weakOpenings.length > 0 && (
                <div className="bg-card border rounded-2xl p-3 space-y-2"
                  style={{ borderColor: "oklch(0.63 0.23 25 / 0.3)" }}>
                  <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-red)" }}>
                    Críticas
                  </p>
                  {weakOpenings.map((o) => (
                    <div key={o.id}>
                      <p className="text-xs font-semibold truncate">{o.opening_name}</p>
                      <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}g</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <OpeningWinrateChart openings={openings} />
          </div>
        )}

        {/* ── Other insights ──────────────────────────────────── */}
        {remainingInsights.length > 0 && (
          <InsightsCard insights={remainingInsights} username={username} />
        )}

      </div>
    </AppLayout>
  );
}
