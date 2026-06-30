"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackGamesImported } from "@/lib/installTracking";

export default function Home() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      trackGamesImported(data.imported ?? 1);
      document.cookie = `bv_username=${encodeURIComponent(username.trim())}; path=/; max-age=2592000; SameSite=Lax`;
      router.push(`/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setLoading(false);
    }
  }

  const features = [
    { icon: "♟", title: "Detecta tus errores", desc: "Stockfish analiza cada jugada y clasifica errores graves, errores y imprecisiones." },
    { icon: "📊", title: "Barra de evaluación", desc: "Ve cómo cambia la ventaja en cada movimiento de la partida." },
    { icon: "🎯", title: "Practica tus errores", desc: "Reproduce las posiciones donde fallaste e intenta encontrar la jugada correcta." },
    { icon: "📖", title: "Repertorio de aperturas", desc: "Descubre con qué aperturas ganas más y cuáles debes mejorar." },
  ];

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-12 pb-6 text-center">
        <div className="mb-4 text-5xl select-none">♔</div>

        <h1 className="text-3xl font-bold tracking-tight leading-tight mb-2">
          AnaliChess <span style={{ color: "var(--bv-purple)" }}>IA</span>
        </h1>

        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
          Conecta tu cuenta de Chess.com y descubre exactamente en qué jugadas pierdes partidas — con análisis de Stockfish y entrenamiento interactivo.
        </p>

        {/* Form */}
        <form onSubmit={handleImport} className="w-full max-w-xs space-y-3">
          <input
            type="text"
            placeholder="Tu usuario de Chess.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            disabled={loading}
            className="w-full px-4 py-3 rounded-2xl border text-sm outline-none transition-all"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--bv-purple)", color: "#fff" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                Importando partidas…
              </span>
            ) : "Ver mis partidas →"}
          </button>
          {error && (
            <p className="text-xs text-center" style={{ color: "var(--bv-red)" }}>{error}</p>
          )}
        </form>

        <p className="text-[11px] text-muted-foreground mt-4">
          Gratis · Sin registro · Últimas 200 partidas públicas
        </p>
      </div>

      {/* Features */}
      <div className="px-5 pb-10 grid grid-cols-2 gap-3 max-w-sm mx-auto w-full">
        {features.map((f) => (
          <div key={f.title}
            className="rounded-2xl p-4 border flex flex-col gap-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <span className="text-2xl">{f.icon}</span>
            <p className="text-xs font-bold leading-snug">{f.title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

    </main>
  );
}
