"use client";

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { EloPoint } from "@/services/dashboardData";

interface Props {
  history: EloPoint[];
}

export function EloEvolutionChart({ history }: Props) {
  if (history.length < 2) return null;

  const elos = history.map((p) => p.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const pad = Math.max(20, Math.round((max - min) * 0.15));

  const first = history[0].elo;
  const last = history[history.length - 1].elo;
  const delta = last - first;
  const peak = max;

  const accent = delta >= 0 ? "var(--bv-green)" : "var(--bv-red)";

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Evolución de ELO
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {history.length} partidas · pico {peak}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: accent }}>{last}</p>
          <p className="text-[11px] font-semibold" style={{ color: accent }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={history} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bv-purple)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--bv-purple)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="index"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(v) => `${v}`}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            domain={[min - pad, max + pad]}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            labelFormatter={(v) => `Partida ${v}`}
            formatter={(value, name) => [`${value}`, name === "elo" ? "Tu ELO" : "Rival"]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="elo"
            stroke="var(--bv-purple)"
            strokeWidth={2}
            fill="url(#eloFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="opponentElo"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            opacity={0.5}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: "var(--bv-purple)" }} /> Tu ELO
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: "var(--muted-foreground)" }} /> Rival
        </span>
      </div>
    </div>
  );
}
