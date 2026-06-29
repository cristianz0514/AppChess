"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { OpeningStat } from "@/types";

interface Props {
  openings: OpeningStat[];
}

export function OpeningWinrateChart({ openings }: Props) {
  const data = openings
    .filter((o) => o.games_played >= 2)
    .slice(0, 8)
    .map((o) => ({
      name: o.opening_name.length > 18 ? o.opening_name.slice(0, 18) + "…" : o.opening_name,
      winrate: o.winrate,
    }));

  if (data.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium">Opening Win Rate</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(v) => [`${v}%`, "Win rate"]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="winrate" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.winrate >= 50 ? "oklch(0.6 0.2 145)" : "oklch(0.6 0.2 25)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
