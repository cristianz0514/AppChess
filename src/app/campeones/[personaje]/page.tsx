import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getChampionProgress } from "@/services/championProgress";
import { findChampion } from "@/lib/champions";

interface Props {
  params: Promise<{ personaje: string }>;
}

export default async function ChampionChaptersPage({ params }: Props) {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) notFound();

  const { personaje } = await params;
  const champion = findChampion(personaje);
  if (!champion || champion.locked) notFound();

  const progress = await getChampionProgress(userId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <BackButton href="/campeones" />
        <span className="font-bold text-base tracking-tight">{champion.name}</span>
      </header>

      <main className="flex-1 pt-24 px-4 max-w-lg mx-auto w-full pb-8 space-y-4">
        {/* Budapest at dusk — this is where the story starts, before any of
            the tournament halls the chapters actually happen in. */}
        <div className="-mx-4 -mt-2 mb-1 overflow-hidden" style={{ maxHeight: 130 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset */}
          <img src="/campeones/budapest-atardecer.jpg" alt="" className="w-full h-full object-cover" />
        </div>
        <p className="text-sm text-muted-foreground text-center text-balance">{champion.tagline}</p>
        <p className="text-xs text-center rounded-lg px-3 py-2" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>
          Todos los capítulos están habilitados temporalmente para validarlos. Más adelante se
          desbloquearán en orden, uno a uno, según ganes el anterior.
        </p>

        <div className="space-y-3">
          {champion.chapters.map((chapter, i) => {
            const won = progress.get(`${champion.id}/${chapter.id}`)?.result === "win";
            return (
              <Link
                key={chapter.id}
                href={`/campeones/${champion.id}/${chapter.id}`}
                className="flex items-center gap-4 p-4 rounded-2xl border transition active:scale-[0.98]"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0 font-display font-bold"
                  style={{ width: 40, height: 40, background: champion.color, color: "#fff" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{chapter.title}</p>
                  <p className="text-xs text-muted-foreground">Vs {chapter.opponentName} · ELO {chapter.eloTarget}</p>
                </div>
                {won && <CheckCircle2 size={18} style={{ color: "var(--bv-green)" }} className="shrink-0" />}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
