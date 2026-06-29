"use client";

import { useState } from "react";
import type { Insight } from "@/types";

interface Props {
  insights: Insight[];
  username: string;
}

const categoryLabel: Record<Insight["category"], string> = {
  opening: "Opening",
  tactical: "Tactics",
  time_management: "Time",
  recurring_blunder: "Blunder Pattern",
};

const severityColor: Record<Insight["severity"], string> = {
  low: "border-yellow-500/40 bg-yellow-500/5",
  medium: "border-orange-500/40 bg-orange-500/5",
  high: "border-red-500/40 bg-red-500/5",
};

const severityDot: Record<Insight["severity"], string> = {
  low: "bg-yellow-500",
  medium: "bg-orange-500",
  high: "bg-red-500",
};

export function InsightsCard({ insights: initial, username }: Props) {
  const [insights, setInsights] = useState<Insight[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Re-fetch insights from dashboard route by reloading the page
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">AI Coach</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Personalized insights from your games</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing…" : insights.length === 0 ? "Generate" : "Refresh"}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {insights.length === 0 && !loading && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Click &ldquo;Generate&rdquo; to get personalized coaching insights based on your recent games.
          </p>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-accent/20 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading &&
          insights.map((insight) => (
            <div
              key={insight.id}
              className={`border rounded-lg px-4 py-3 space-y-1.5 ${severityColor[insight.severity]}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${severityDot[insight.severity]}`} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {categoryLabel[insight.category]}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{insight.message}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
