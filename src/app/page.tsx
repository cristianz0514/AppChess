"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackGamesImported } from "@/lib/installTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      // Persist username in a long-lived cookie so the dashboard works without query params
      document.cookie = `bv_username=${encodeURIComponent(username.trim())}; path=/; max-age=2592000; SameSite=Lax`;
      router.push(`/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            BlunderVision <span className="text-primary">AI</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Análisis de ajedrez para jugadores de blitz y rapid.
          </p>
        </div>
        <form onSubmit={handleImport} className="space-y-3">
          <Input
            placeholder="Usuario de Chess.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={loading || !username.trim()}>
            {loading ? "Importando partidas..." : "Analizar Partidas"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
        <p className="text-xs text-muted-foreground text-center">
          Obtiene tus últimas 200 partidas públicas. Sin registro.
        </p>
      </div>
    </main>
  );
}
