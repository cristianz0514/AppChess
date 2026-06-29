"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { DashboardStats } from "@/types";

interface Props {
  stats: DashboardStats;
}

const COLORS = [
  "oklch(0.6 0.2 145)",
  "oklch(0.6 0.2 25)",
  "oklch(0.75 0.15 85)",
];

export function ResultsPieChart({ stats }: Props) {
  const data = [
    { name: "Victorias", value: stats.wins },
    { name: "Derrotas",  value: stats.losses },
    { name: "Tablas",    value: stats.draws },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium">Distribución de Resultados</h2>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [v, "Partidas"]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", color: "var(--muted-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
