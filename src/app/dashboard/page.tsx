import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserId, getDashboardStats, getTopOpenings, getHighlightGames, getEloHistory, getResultStats } from "@/services/dashboardData";
import type { HighlightGame } from "@/services/dashboardData";
import { getInsights } from "@/services/insightsGenerator";
import { InsightsCard } from "@/components/InsightsCard";
import { EloEvolutionChart } from "@/components/charts/EloEvolutionChart";
import { translateOpening } from "@/lib/translateOpening";
import { Trophy, TrendingDown, TrendingUp, Search, Play, Zap, type LucideIcon } from "lucide-react";
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

function HighlightCard({
  label, Icon, game, accentColor, accentBg, stat, jumpBlunder,
}: {
  label: string;
  Icon: LucideIcon;
  game: HighlightGame | null;
  accentColor: string;
  accentBg: string;
  stat: string;
  jumpBlunder?: boolean;
}) {
  if (!game) return null;
  const href = `/blunders/${game.id}${jumpBlunder ? "?blunder=1" : ""}`;
  const resultLabel = game.result === "win" ? "Victoria" : game.result === "loss" ? "Derrota" : "Tablas";
  const resultColor = game.result === "win" ? "var(--bv-green)" : game.result === "loss" ? "var(--bv-red)" : "var(--bv-orange)";
  return (
    <Link href={href}
      className="flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98]"
      style={{ background: accentBg, borderColor: accentColor + "44" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: accentColor + "22" }}>
        <Icon size={18} style={{ color: accentColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: accentColor }}>
          {label}
        </p>
        <p className="text-sm font-semibold truncate leading-tight">{translateOpening(game.opening)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{stat}</p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="text-xs font-bold" style={{ color: resultColor }}>{resultLabel}</p>
        <p className="text-muted-foreground text-xs">›</p>
      </div>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: Props) {
  const { username: usernameParam } = await searchParams;
  const cookieStore = await cookies();
  const username = usernameParam ?? cookieStore.get("bv_username")?.value;

  if (!username) redirect("/");

  const userId = await getUserId(username);
  if (!userId) redirect("/");

  const [stats, openings, insights, highlights, eloHistory, resultStats] = await Promise.all([
    getDashboardStats(userId),
    getTopOpenings(userId),
    getInsights(userId),
    getHighlightGames(userId),
    getEloHistory(userId),
    getResultStats(userId),
  ]);

  const topInsight = insights.find((i) => i.severity === "high") ?? insights[0] ?? null;
  const remainingInsights = insights.filter((i) => i !== topInsight);

  const strongOpenings = openings.filter((o) => o.winrate >= 55).slice(0, 2);
  const weakOpenings   = openings.filter((o) => o.winrate < 45).slice(0, 2);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">


        {/* ── HERO: the dominant experience — revisit where you collapsed ── */}
        {highlights.mostErrors && highlights.mostErrors.errorCount > 0 && (
          <Link
            href={`/blunders/${highlights.mostErrors.id}?story=1`}
            className="block rounded-3xl p-5 border transition-all active:scale-[0.99]"
            style={{
              borderColor: "var(--bv-purple)",
              background: "linear-gradient(135deg, oklch(0.61 0.22 285 / 0.12), oklch(0.63 0.23 25 / 0.06))",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: "var(--bv-purple)" }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                Dónde se te escapó la partida
              </span>
            </div>
            <p className="text-xl font-display font-bold leading-tight">
              {translateOpening(highlights.mostErrors.opening)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {highlights.mostErrors.result === "loss"
                ? `La perdiste con ${highlights.mostErrors.errorCount} errores`
                : highlights.mostErrors.result === "draw"
                  ? `Terminó en tablas, pero cometiste ${highlights.mostErrors.errorCount} errores`
                  : `La ganaste, pero con ${highlights.mostErrors.errorCount} errores`}
              . Te llevo por los momentos que la decidieron.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-bold text-sm"
              style={{ background: "var(--bv-purple)" }}>
              <Play size={15} fill="#fff" /> Revivir el momento
            </div>
          </Link>
        )}

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
            <p className="text-xs text-muted-foreground">{stats.totalGames} partidas</p>
          </div>

          {/* Win / Loss record */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Resultados
            </p>
            <p className="text-2xl font-bold tracking-tight">
              <span style={{ color: "var(--bv-green)" }}>{resultStats.wins}V</span>
              {" – "}
              <span style={{ color: "var(--bv-red)" }}>{resultStats.losses}D</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {resultStats.winrate}% victorias
              {resultStats.excluded > 0 && ` · ${resultStats.excluded} excl.`}
            </p>
          </div>
        </div>

        {/* ── Stats strip ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Precisión", value: stats.avgAccuracy ? `${stats.avgAccuracy}%` : "—", color: "var(--bv-green)" },
            { label: "Tablas",    value: resultStats.draws,    color: "var(--bv-orange)" },
            { label: "Victorias", value: `${resultStats.winrate}%`, color: "var(--bv-green)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Partidas Destacadas ─────────────────────────────── */}
        {(highlights.best || highlights.worst || highlights.mostErrors) && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Partidas Clave
            </p>
            <div className="space-y-2">
              <HighlightCard
                label="Mejor Partida"
                Icon={Trophy}
                game={highlights.best}
                accentColor="var(--bv-green)"
                accentBg="oklch(0.77 0.17 177 / 0.12)"
                stat={highlights.best?.accuracy != null ? `${highlights.best.accuracy}% precisión` : `${highlights.best?.errorCount ?? 0} errores`}
              />
              <HighlightCard
                label="Peor Partida"
                Icon={TrendingDown}
                game={highlights.worst}
                accentColor="var(--bv-red)"
                accentBg="oklch(0.63 0.23 25 / 0.12)"
                stat={highlights.worst?.accuracy != null ? `${highlights.worst.accuracy}% precisión` : `${highlights.worst?.errorCount ?? 0} errores`}
              />
              <HighlightCard
                label="Más Debilidades"
                Icon={Search}
                game={highlights.mostErrors}
                accentColor="var(--bv-purple)"
                accentBg="oklch(0.61 0.22 285 / 0.12)"
                stat={`${highlights.mostErrors?.errorCount ?? 0} errores graves`}
                jumpBlunder
              />
            </div>
          </div>
        )}

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

        {/* ── ELO Evolution ───────────────────────────────────── */}
        <EloEvolutionChart history={eloHistory} />

        {/* ── Recent Performance ──────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Rendimiento Reciente
          </p>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "oklch(0.77 0.17 177 / 0.15)" }}>
                  <TrendingUp size={16} style={{ color: "var(--bv-green)" }} />
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
                      <p className="text-xs font-semibold truncate">{translateOpening(o.opening_name)}</p>
                      <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}p</p>
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
                      <p className="text-xs font-semibold truncate">{translateOpening(o.opening_name)}</p>
                      <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}p</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
