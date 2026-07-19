"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Insight } from "@/types";

interface Props {
  insights: Insight[];
  username: string;
}

const categoryLabel: Record<Insight["category"], string> = {
  opening:           "Hábito de Apertura",
  tactical:          "Patrón Táctico",
  time_management:   "Gestión del Tiempo",
  recurring_blunder: "Error Recurrente",
};

const severityStyle: Record<Insight["severity"], { dot: string; tag: string }> = {
  low:    { dot: "var(--bv-green)",  tag: "oklch(0.77 0.17 177 / 0.15)" },
  medium: { dot: "var(--bv-orange)", tag: "oklch(0.70 0.18 50 / 0.15)"  },
  high:   { dot: "var(--bv-red)",    tag: "oklch(0.63 0.23 25 / 0.15)"  },
};

export function InsightsCard({ insights: initial, username }: Props) {
  const router = useRouter();
  const [insights] = useState<Insight[]>(initial);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: "var(--bv-purple)" }} />
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            Coach IA
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] font-semibold px-3 py-1 rounded-full border transition-colors disabled:opacity-40"
          style={{ borderColor: "var(--bv-electric)", color: "var(--bv-electric)" }}
        >
          {loading ? "Analizando…" : insights.length === 0 ? "Generar" : "Actualizar"}
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {error && (
          <p className="text-xs px-3 py-2 rounded-xl border"
            style={{ color: "var(--bv-red)", background: "oklch(0.63 0.23 25 / 0.1)", borderColor: "oklch(0.63 0.23 25 / 0.2)" }}>
            {error}
          </p>
        )}

        {insights.length === 0 && !loading && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Genera consejos personalizados basados en tus partidas.
          </p>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-accent/20 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && insights.map((insight) => {
          const s = severityStyle[insight.severity];
          return (
            <div key={insight.id} className="rounded-xl p-3 space-y-1.5"
              style={{ background: s.tag }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
                <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                  {categoryLabel[insight.category]}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{insight.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
