"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { translateOpening } from "@/lib/translateOpening";
import type { OpeningWithGames } from "@/services/dashboardData";

type ColorFilter = "both" | "white" | "black";

interface PageData {
  openings: OpeningWithGames[];
  colorsWhite: { winrate: number; wins: number; losses: number; draws: number; games: number };
  colorsBlack: { winrate: number; wins: number; losses: number; draws: number; games: number };
  username: string;
}

async function fetchData(color: ColorFilter): Promise<PageData> {
  const res = await fetch(`/api/openings?color=${color}`);
  if (!res.ok) throw new Error("Error al cargar datos");
  return res.json();
}

export default function OpeningsPage() {
  const [color, setColor] = useState<ColorFilter>("both");
  const [data, setData] = useState<PageData | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      fetchData(color).then(setData).catch(console.error);
    });
  }, [color]);

  const openings = data?.openings ?? [];
  const white = data?.colorsWhite;
  const black = data?.colorsBlack;
  const username = data?.username ?? "";

  const strongest = openings.filter((o) => o.winrate >= 55).slice(0, 3);
  const critical  = openings.filter((o) => o.winrate < 45).slice(0, 3);

  const FILTERS: { id: ColorFilter; label: string }[] = [
    { id: "both",  label: "Ambas"   },
    { id: "white", label: "Blancas" },
    { id: "black", label: "Negras"  },
  ];

  if (!data) {
    return (
      <AppLayout username="">
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--bv-purple)", borderTopColor: "transparent" }} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto">

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Análisis</p>
          <h1 className="text-xl font-bold mt-0.5">Repertorio de Aperturas</h1>
        </div>

        {/* ── Color filter ─────────────────────────────────────── */}
        <div className="flex gap-2 p-1 rounded-2xl border border-border bg-card">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setColor(id)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: color === id ? "var(--bv-purple)" : "transparent",
                color: color === id ? "#fff" : "var(--muted-foreground)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Loading state ─────────────────────────────────────── */}
        {!data && (
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-2 gap-3">
              <div className="h-28 bg-muted rounded-2xl" />
              <div className="h-28 bg-muted rounded-2xl" />
            </div>
            <div className="h-48 bg-muted rounded-2xl" />
          </div>
        )}

        {data && (
          <>
            {/* ── Stats por color ──────────────────────────────── */}
            {color === "both" && white && black && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Victorias (Blancas)", stats: white, accent: "var(--bv-green)" },
                  { label: "Victorias (Negras)",  stats: black, accent: "var(--bv-purple)" },
                ].map(({ label, stats, accent }) => (
                  <div key={label} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{label}</p>
                    <p className="text-4xl font-bold" style={{ color: accent }}>
                      {stats.winrate}<span className="text-xl">%</span>
                    </p>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${stats.winrate}%`, background: accent }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{stats.games} partidas · {stats.wins}V {stats.losses}D</p>
                  </div>
                ))}
              </div>
            )}

            {color !== "both" && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
                {(() => {
                  const stats = color === "white" ? white : black;
                  const accent = color === "white" ? "var(--bv-green)" : "var(--bv-purple)";
                  const label = color === "white" ? "Victorias con Blancas" : "Victorias con Negras";
                  if (!stats) return null;
                  return (
                    <>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{label}</p>
                      <p className="text-5xl font-bold" style={{ color: accent }}>
                        {stats.winrate}<span className="text-2xl">%</span>
                      </p>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${stats.winrate}%`, background: accent }} />
                      </div>
                      <p className="text-xs text-muted-foreground">{stats.games} partidas · {stats.wins} victorias · {stats.losses} derrotas · {stats.draws} tablas</p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── Mejores y críticas ───────────────────────────── */}
            {(strongest.length > 0 || critical.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {strongest.length > 0 && (
                  <div className="bg-card rounded-2xl p-4 space-y-3 border border-border border-l-2"
                    style={{ borderLeftColor: "var(--bv-green)" }}>
                    <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-green)" }}>Más Fuertes</p>
                    {strongest.map((o) => (
                      <Link key={o.opening_name}
                        href={`/blunders?opening=${encodeURIComponent(o.opening_name)}`}
                        className="block space-y-0.5 hover:opacity-75 transition-opacity">
                        <p className="text-xs font-semibold truncate">{translateOpening(o.opening_name)}</p>
                        <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}p →</p>
                      </Link>
                    ))}
                  </div>
                )}
                {critical.length > 0 && (
                  <div className="bg-card rounded-2xl p-4 space-y-3 border border-border border-l-2"
                    style={{ borderLeftColor: "var(--bv-red)" }}>
                    <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--bv-red)" }}>Críticas</p>
                    {critical.map((o) => (
                      <Link key={o.opening_name}
                        href={`/blunders?opening=${encodeURIComponent(o.opening_name)}`}
                        className="block space-y-0.5 hover:opacity-75 transition-opacity">
                        <p className="text-xs font-semibold truncate">{translateOpening(o.opening_name)}</p>
                        <p className="text-[10px] text-muted-foreground">{o.winrate}% · {o.games_played}p →</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Rendimiento Detallado ────────────────────────── */}
            {openings.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <p className="px-4 pt-4 pb-2 text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                  Rendimiento Detallado
                  {isPending && <span className="ml-2 opacity-50">· actualizando…</span>}
                </p>
                <div className="divide-y divide-border">
                  {openings.map((o) => {
                    const trend = o.winrate >= 55 ? "↗" : o.winrate < 45 ? "↘" : "→";
                    const trendColor = o.winrate >= 55 ? "var(--bv-green)" : o.winrate < 45 ? "var(--bv-red)" : "var(--muted-foreground)";
                    return (
                      <Link
                        key={o.opening_name}
                        href={`/blunders?opening=${encodeURIComponent(o.opening_name)}`}
                        className="flex items-center justify-between px-4 py-3 gap-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{translateOpening(o.opening_name)}</p>
                          <p className="text-[10px] text-muted-foreground">{o.games_played} partidas · {o.wins}V {o.losses}D {o.draws}T</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-semibold" style={{ color: o.winrate >= 50 ? "var(--bv-green)" : "var(--bv-red)" }}>
                            {o.winrate}%
                          </p>
                          <span className="text-base font-bold" style={{ color: trendColor }}>{trend}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {openings.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <p className="text-2xl">♟</p>
                <p className="text-sm text-muted-foreground">Sin datos para el filtro seleccionado.</p>
              </div>
            )}
          </>
        )}

      </div>
    </AppLayout>
  );
}
