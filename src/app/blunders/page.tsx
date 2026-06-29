import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";
import { getUserId, getDashboardStats, getRecentGames, getGamesByOpening } from "@/services/dashboardData";

function resultBadge(result: string) {
  if (result === "win")  return { label: "V", bg: "oklch(0.77 0.17 177 / 0.18)", color: "var(--bv-green)" };
  if (result === "loss") return { label: "D", bg: "oklch(0.63 0.23 25 / 0.18)",  color: "var(--bv-red)" };
  return                        { label: "E", bg: "oklch(0.70 0.18 50 / 0.18)",  color: "var(--bv-orange)" };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { month: "short", day: "numeric" });
}

interface Props {
  searchParams: Promise<{ opening?: string }>;
}

export default async function BlundersPage({ searchParams }: Props) {
  const { opening } = await searchParams;
  const username = await getUsername();
  const userId   = await getUserId(username);
  if (!userId) return null;

  const [stats, games] = await Promise.all([
    getDashboardStats(userId),
    opening
      ? getGamesByOpening(userId, opening)
      : getRecentGames(userId, 200),
  ]);

  const wins   = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws  = games.filter((g) => g.result === "draw").length;

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Historial</p>
          <h1 className="text-xl font-bold mt-0.5">
            {opening ? "Partidas por Apertura" : "Partidas Recientes"}
          </h1>
          {opening && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-1 rounded-full border font-medium truncate max-w-[260px]"
                style={{ borderColor: "var(--bv-purple)", color: "var(--bv-purple)", background: "oklch(0.61 0.22 285 / 0.1)" }}>
                {opening}
              </span>
              <Link href="/blunders" className="text-xs text-muted-foreground underline underline-offset-2">
                Ver todas
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Victorias", value: wins,   color: "var(--bv-green)"  },
            { label: "Derrotas",  value: losses, color: "var(--bv-red)"    },
            { label: "Tablas",    value: draws,  color: "var(--bv-orange)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {stats.avgAccuracy !== null && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Precisión Promedio</p>
              <p className="text-sm text-muted-foreground mt-0.5">Últimas {stats.totalGames} partidas</p>
            </div>
            <p className="text-4xl font-bold" style={{ color: "var(--bv-green)" }}>
              {stats.avgAccuracy}%
            </p>
          </div>
        )}

        {games.length > 0 ? (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
              Registro de Partidas
            </p>
            <div className="divide-y divide-border">
              {games.map((game) => {
                const badge   = resultBadge(game.result);
                const rating  = game.played_as === "white" ? game.white_rating : game.black_rating;
                const opening = game.opening ?? "Apertura Desconocida";
                return (
                  <Link key={game.id} href={`/blunders/${game.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs"
                      style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{opening}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {game.played_as === "white" ? "Blancas" : "Negras"} · {game.time_control} · {formatDate(game.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold">{rating ?? "—"}</p>
                      {game.accuracy !== null && (
                        <p className="text-[10px] text-muted-foreground">{game.accuracy}%</p>
                      )}
                    </div>
                    <span className="text-muted-foreground text-sm shrink-0">›</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            Sin partidas aún. Importa tus partidas desde el inicio.
          </p>
        )}

      </div>
    </AppLayout>
  );
}
