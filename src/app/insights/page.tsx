import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getCoachInsights } from "@/services/insightsGenerator";
import type { RelatedGame } from "@/services/insightsGenerator";
import { Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { translateOpening } from "@/lib/translateOpening";
import type { Insight } from "@/types";

const categoryLabel: Record<Insight["category"], string> = {
  opening:           "Hábito de Apertura",
  tactical:          "Patrón Táctico",
  time_management:   "Gestión del Tiempo",
  recurring_blunder: "Error Recurrente",
};

const resultLabel: Record<string, string> = {
  win: "V", loss: "D", draw: "E",
};
const resultColor: Record<string, string> = {
  win: "var(--bv-green)", loss: "var(--bv-red)", draw: "var(--bv-orange)",
};

function GameList({ games, jumpBlunder }: { games: RelatedGame[]; jumpBlunder?: boolean }) {
  if (games.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Partidas relacionadas</p>
      {games.map((g) => (
        <Link key={g.id} href={`/blunders/${g.id}${jumpBlunder ? "?blunder=1" : ""}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
          <span className="text-[10px] font-bold w-4 text-center" style={{ color: resultColor[g.result] ?? "var(--foreground)" }}>
            {resultLabel[g.result] ?? "—"}
          </span>
          <span className="text-xs flex-1 truncate">{translateOpening(g.opening)}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{g.detail}</span>
          <span className="text-muted-foreground text-xs">›</span>
        </Link>
      ))}
    </div>
  );
}

export const metadata = { title: "Coach IA" };

// The notices are worked out from the games on every visit (see getCoachInsights): what is
// shown is always what the player's analysed games say now, not a copy saved earlier.
export default async function InsightsPage() {
  const username  = await getUsername();
  const userId    = await getUserId(username);
  if (!userId) return null;

  const { insights, analyzedGames } = await getCoachInsights(userId);

  const featured = insights.find((i) => i.severity === "high") ?? insights[0] ?? null;
  const rest      = insights.filter((i) => i !== featured);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto"
        style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        {/* Saludo */}
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Coach IA</p>
          <h1 className="font-deco text-2xl mt-0.5">Hola, <span className="capitalize">{username}</span>.</h1>
          {insights.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Basado en tus últimas {analyzedGames} partidas analizadas. Esto es lo que encontré.
            </p>
          )}
        </div>

        {/* Insight destacado */}
        {featured ? (
          <div className="deco-step bg-card border border-border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={13} style={{ color: "var(--bv-purple)" }} />
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Consejo del día</p>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "oklch(0.77 0.17 177 / 0.15)", color: "var(--bv-green)" }}>
                {categoryLabel[featured.category]}
              </span>
            </div>
            <p className="text-sm leading-relaxed font-medium">{featured.message}</p>
            <GameList
              games={featured.games}
              jumpBlunder={featured.category === "tactical" || featured.category === "recurring_blunder"}
            />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 text-center">
            <Sparkles size={16} className="mx-auto" style={{ color: "var(--bv-purple)" }} />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {analyzedGames === 0
                ? "Todavía no tienes partidas analizadas. Analiza una y el coach te dirá qué patrones encuentra."
                : `Con ${analyzedGames} ${analyzedGames === 1 ? "partida analizada" : "partidas analizadas"} todavía no hay un patrón claro. Analiza más partidas para que el coach pueda compararlas.`}
            </p>
            <Link href="/blunders" className="inline-block text-xs font-semibold px-4 py-2 rounded-full border transition-colors hover:bg-muted/50"
              style={{ borderColor: "var(--bv-electric)", color: "var(--bv-electric)" }}>
              Ir a Partidas
            </Link>
          </div>
        )}

        {/* Patrones de comportamiento */}
        {rest.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Patrones de Comportamiento
            </p>
            <div className="divide-y divide-border">
              {rest.map((insight) => {
                const isPositive = insight.severity === "low";
                const jumpBlunder = insight.category === "tactical" || insight.category === "recurring_blunder";
                return (
                  <div key={insight.message} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: isPositive ? "oklch(0.77 0.17 177 / 0.12)" : "oklch(0.70 0.18 50 / 0.12)" }}>
                        {isPositive
                          ? <TrendingUp size={16} style={{ color: "var(--bv-green)" }} />
                          : <AlertTriangle size={16} style={{ color: "var(--bv-orange)" }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">{categoryLabel[insight.category]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.message}</p>
                      </div>
                    </div>
                    {insight.games.length > 0 && (
                      <div className="pl-11">
                        <GameList games={insight.games} jumpBlunder={jumpBlunder} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="rounded-2xl p-5 text-center space-y-2"
          style={{ background: "oklch(0.34 0.10 264 / 0.15)", border: "1px solid oklch(0.34 0.10 264 / 0.25)" }}>
          <p className="text-sm font-bold">La maestría es un camino.</p>
          <p className="text-xs text-muted-foreground">Sigue analizando tus partidas para descubrir patrones más profundos.</p>
        </div>

      </div>
    </AppLayout>
  );
}
