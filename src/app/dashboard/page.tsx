import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUserId, getDashboardStats, getHighlightGames, getEloHistory, getResultStats, getTimeClasses, pickDefaultClass } from "@/services/dashboardData";
import { TimeClassSelector } from "@/components/TimeClassSelector";
import { EloEvolutionChart } from "@/components/charts/EloEvolutionChart";
import { translateOpening } from "@/lib/translateOpening";
import { Zap, Play } from "lucide-react";

export const metadata = { title: "Inicio" };

interface Props {
  searchParams: Promise<{ username?: string; tc?: string }>;
}

// Deliberately minimal home: the single most important game to revisit (hero),
// the rating snapshot, and the ELO trend — nothing else. Everything that used
// to be duplicated here (recent games, key games, openings, insights) lives on
// its own tab (Partidas, Aperturas, Coach IA), so this screen answers one
// question at a glance — "how am I doing, and what should I look at next?" —
// instead of repeating the same accuracy/winrate numbers three times.
export default async function DashboardPage({ searchParams }: Props) {
  const { username: usernameParam, tc } = await searchParams;
  const cookieStore = await cookies();
  const username = usernameParam ?? cookieStore.get("bv_username")?.value;

  if (!username) redirect("/");

  const userId = await getUserId(username);
  if (!userId) redirect("/");

  // Pick the time control to show: the requested one, else the most-played.
  const timeClasses = await getTimeClasses(userId);
  const activeTc = tc ?? pickDefaultClass(timeClasses);

  const [stats, highlights, eloHistory, resultStats] = await Promise.all([
    getDashboardStats(userId, activeTc),
    getHighlightGames(userId, activeTc),
    getEloHistory(userId, activeTc),
    getResultStats(userId, activeTc),
  ]);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto"
        style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        {/* Time-control selector — keep Blitz/Rapid/… stats separate */}
        <TimeClassSelector classes={timeClasses} current={activeTc} />

        {/* ── HERO: the single game most worth revisiting ── */}
        {highlights.mostErrors && highlights.mostErrors.errorCount > 0 && (
          <Link
            href={`/blunders/${highlights.mostErrors.id}?blunder=1`}
            className="deco-step block p-5 border transition active:scale-[0.99]"
            style={{
              borderColor: "var(--bv-purple)",
              background: "linear-gradient(135deg, oklch(0.34 0.10 264 / 0.12), oklch(0.63 0.23 25 / 0.06))",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: "var(--bv-purple)" }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-purple)" }}>
                Dónde se te escapó la partida
              </span>
            </div>
            {/* Plain text, not .font-deco/uppercase — real opening names plus
                move notation are variable-length data, not a short headline,
                and the condensed display face wrapped them into an
                unreadable 3-line block. */}
            <p className="text-lg font-bold leading-snug">
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
            <div className="deco-step-sm mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-white font-bold text-sm"
              style={{ background: "var(--bv-electric)" }}>
              <Play size={15} fill="#fff" /> Revivir el momento
            </div>
          </Link>
        )}

        {/* ── Rating row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="deco-step-sm bg-card border border-border p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Rating
            </p>
            <p className="font-deco text-4xl leading-none" style={{ color: "var(--bv-green)" }}>
              {stats.currentRating ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">{stats.totalGames} partidas</p>
          </div>

          <div className="deco-step-sm bg-card border border-border p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
              Resultados
            </p>
            <p className="font-deco text-2xl leading-none">
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

        {/* ── ELO Evolution ── */}
        <div className="pt-2">
          <EloEvolutionChart history={eloHistory} />
        </div>

      </div>
    </AppLayout>
  );
}
