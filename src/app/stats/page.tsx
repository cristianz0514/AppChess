import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId, getDashboardStats, getTopOpenings, getColorStats } from "@/services/dashboardData";

export default async function StatsPage() {
  const username = await getUsername();
  const userId   = await getUserId(username);
  if (!userId) return null;

  const [stats, openings, colors] = await Promise.all([
    getDashboardStats(userId),
    getTopOpenings(userId),
    getColorStats(userId),
  ]);

  const initials    = username.slice(0, 2).toUpperCase();
  const bestOpening = openings.sort((a, b) => b.winrate - a.winrate)[0] ?? null;

  const statRows = [
    { label: "Total de Partidas", value: stats.totalGames,                                    color: "var(--foreground)" },
    { label: "Tasa de Victoria",  value: `${stats.winrate}%`,                                 color: stats.winrate >= 50 ? "var(--bv-green)" : "var(--bv-red)" },
    { label: "Precisión Prom.",   value: stats.avgAccuracy ? `${stats.avgAccuracy}%` : "—",   color: "var(--bv-green)" },
    { label: "Victorias",         value: stats.wins,                                           color: "var(--bv-green)"  },
    { label: "Derrotas",          value: stats.losses,                                         color: "var(--bv-red)"    },
    { label: "Tablas",            value: stats.draws,                                          color: "var(--bv-orange)" },
  ];

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        {/* Tarjeta de perfil */}
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            style={{ background: "oklch(0.61 0.22 285 / 0.25)", color: "var(--bv-purple)" }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold capitalize truncate">{username}</p>
            <p className="text-xs text-muted-foreground">Chess.com · Blitz / Rapid</p>
            {stats.currentRating && (
              <p className="text-sm font-bold mt-0.5" style={{ color: "var(--bv-green)" }}>
                {stats.currentRating} puntos
              </p>
            )}
          </div>
        </div>

        {/* Estadísticas */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Resumen de Rendimiento
          </p>
          <div className="divide-y divide-border">
            {statRows.map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-sm font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* División por color */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Con Blancas", stats: colors.white, color: "var(--bv-green)" },
            { label: "Con Negras",  stats: colors.black, color: "var(--bv-purple)" },
          ].map(({ label, stats: cs, color }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold" style={{ color }}>{cs.winrate}%</p>
              <p className="text-[10px] text-muted-foreground">{cs.wins}V {cs.losses}D {cs.draws}T</p>
            </div>
          ))}
        </div>

        {/* Mejor apertura */}
        {bestOpening && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Mejor Apertura
            </p>
            <p className="text-sm font-bold">{bestOpening.opening_name}</p>
            <p className="text-xs text-muted-foreground">
              {bestOpening.winrate}% de victorias · {bestOpening.games_played} partidas
            </p>
          </div>
        )}

        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">AnaliChess IA · Datos sincronizados desde Chess.com</p>
        </div>

      </div>
    </AppLayout>
  );
}
