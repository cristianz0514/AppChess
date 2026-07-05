"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackGamesImported } from "@/lib/installTracking";
import { Target, Activity, Crosshair, BookOpen, type LucideIcon } from "lucide-react";

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
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar. Inténtalo de nuevo.");

      trackGamesImported(data.imported ?? 1);
      document.cookie = `bv_username=${encodeURIComponent(username.trim())}; path=/; max-age=2592000; SameSite=Lax`;
      router.push(`/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setLoading(false);
    }
  }

  const features: { Icon: LucideIcon; title: string; desc: string }[] = [
    { Icon: Target,    title: "Detecta tus errores", desc: "Stockfish analiza cada jugada y clasifica errores graves, errores e imprecisiones." },
    { Icon: Activity,  title: "Barra de evaluación", desc: "Ve cómo cambia la ventaja en cada movimiento de la partida." },
    { Icon: Crosshair, title: "Practica tus errores", desc: "Reproduce las posiciones donde fallaste e intenta encontrar la jugada correcta." },
    { Icon: BookOpen,  title: "Repertorio de aperturas", desc: "Descubre con qué aperturas ganas más y cuáles debes mejorar." },
  ];

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "var(--background)" }}>

      {/* Ambient backdrop — soft radial glow, no chess clichés */}
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{
        background: "radial-gradient(120% 80% at 50% -10%, oklch(0.61 0.22 285 / 0.10), transparent 60%)",
      }} />

      {/* Hero */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 pt-14 pb-6 text-center"
        style={{ animation: "bvFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        {/* Monogram tile */}
        <div className="mb-5 w-14 h-14 rounded-2xl flex items-center justify-center select-none shadow-sm"
          style={{ background: "var(--bv-purple)", color: "#fff" }}>
          <span className="text-3xl leading-none font-display">♞</span>
        </div>

        {/* Eyebrow */}
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: "var(--bv-purple)" }}>
          Tu entrenador de ajedrez con IA
        </p>

        <h1 className="font-display text-4xl font-bold tracking-tight leading-[1.05] mb-3 text-balance max-w-sm">
          Descubre dónde se te <span style={{ color: "var(--bv-purple)" }}>escapan</span> las partidas
        </h1>

        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
          Conecta tu cuenta de Chess.com y Stockfish analiza cada jugada — errores graves, momentos clave y qué debiste jugar.
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
                Importando tu historial…
              </span>
            ) : "Ver mis partidas →"}
          </button>
          {error && (
            <p className="text-xs text-center" style={{ color: "var(--bv-red)" }}>{error}</p>
          )}
        </form>

        <p className="text-[11px] text-muted-foreground mt-4">
          Gratis · Sin registro · Todo tu historial público
        </p>
      </div>

      {/* Features */}
      <div className="relative px-5 pb-10 grid grid-cols-2 gap-3 max-w-sm mx-auto w-full">
        {features.map((f, i) => (
          <div key={f.title}
            className="rounded-2xl p-4 border flex flex-col gap-2 transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              animation: `bvFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both ${0.15 + i * 0.07}s`,
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.61 0.22 285 / 0.12)" }}>
              <f.Icon size={18} style={{ color: "var(--bv-purple)" }} strokeWidth={2} />
            </div>
            <p className="text-xs font-bold leading-snug mt-1">{f.title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

    </main>
  );
}
