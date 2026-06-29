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
      router.push(`/dashboard?username=${encodeURIComponent(username.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
            Chess analytics for blitz and rapid players.
          </p>
        </div>
        <form onSubmit={handleImport} className="space-y-3">
          <Input
            placeholder="Chess.com username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={loading || !username.trim()}>
            {loading ? "Importing games..." : "Analyze Games"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
        <p className="text-xs text-muted-foreground text-center">
          Fetches your last 50 public games. No account needed.
        </p>
      </div>
    </main>
  );
}
