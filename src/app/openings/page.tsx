import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId, getTopOpenings, getColorStats } from "@/services/dashboardData";
import { OpeningWinrateChart } from "@/components/charts/OpeningWinrateChart";

export default async function OpeningsPage() {
  const username = await getUsername();
  const userId   = await getUserId(username);
  if (!userId) return null;

  const [openings, colors] = await Promise.all([
    getTopOpenings(userId),
    getColorStats(userId),
  ]);

  const strongest = openings.filter((o) => o.winrate >= 55).slice(0, 3);
  const critical  = openings.filter((o) => o.winrate < 45).slice(0, 3);

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Análisis</p>
          <h1 className="text-xl font-bold mt-0.5">Repertorio de Aperturas</h1>
        </div>

        {/* Tasa de victoria por color */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Victorias (Blancas)", stats: colors.white, color: "var(--bv-green)" },
            { label: "Victorias (Negras)",  stats: colors.black, color: "var(--bv-purple)" },
          ].map(({ label, stats, color }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{label}</p>
              <p className="text-4xl font-bold" style={{ color }}>{stats.winrate}<span className="text-xl">%</span></p>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${stats.winrate}%`, background: color }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{stats.games} partidas · {stats.wins}V {stats.losses}D</p>
            </div>
          ))}
        </div>

        {/* Mejores y críticas */}
        {(strongest.length > 0 || critical.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {strongest.length > 0 && (
              <div className="bg-card rounded-2xl p-4 space-y-3 border-l-2"
                style={{ borderColor: "var(--bv-green)", borderTopColor: "var(--border)", borderRightColor: "var(--border)", borderBottomColor: "var(--border)" }}>
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-green)" }}>Más Fuertes</p>
                {strongest.map((o) => (
                  <div key={o.id} className="space-y-0.5">
                    <p className="text-xs font-semibold truncate">{o.opening_name}</p>
                    <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played} partidas</p>
                  </div>
                ))}
              </div>
            )}
            {critical.length > 0 && (
              <div className="bg-card rounded-2xl p-4 space-y-3 border-l-2"
                style={{ borderColor: "var(--bv-red)", borderTopColor: "var(--border)", borderRightColor: "var(--border)", borderBottomColor: "var(--border)" }}>
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-red)" }}>Críticas</p>
                {critical.map((o) => (
                  <div key={o.id} className="space-y-0.5">
                    <p className="text-xs font-semibold truncate">{o.opening_name}</p>
                    <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played} partidas</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <OpeningWinrateChart openings={openings} />

        {openings.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Rendimiento Detallado
            </p>
            <div className="divide-y divide-border">
              {openings.map((o) => {
                const trend = o.winrate >= 55 ? "↗" : o.winrate < 45 ? "↘" : "→";
                const trendColor = o.winrate >= 55 ? "var(--bv-green)" : o.winrate < 45 ? "var(--bv-red)" : "var(--muted-foreground)";
                return (
                  <div key={o.id} className="flex items-center justify-between px-4 py-3 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{o.opening_name}</p>
                      <p className="text-[10px] text-muted-foreground">{o.games_played} partidas</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold" style={{ color: o.winrate >= 50 ? "var(--bv-green)" : "var(--bv-red)" }}>
                        {o.winrate}%
                      </p>
                      <span className="text-base font-bold" style={{ color: trendColor }}>{trend}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {openings.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Sin datos de aperturas aún. Importa tus partidas primero.
          </p>
        )}

      </div>
    </AppLayout>
  );
}
