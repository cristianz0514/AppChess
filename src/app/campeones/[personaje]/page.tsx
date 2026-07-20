import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
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
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto"
        style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Historia</p>
          <h1 className="font-deco text-2xl mt-0.5 uppercase">{champion.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 text-balance">{champion.tagline}</p>
        </div>

        <div className="space-y-3">
          {champion.chapters.map((chapter, i) => {
            const won = progress.get(`${champion.id}/${chapter.id}`)?.result === "win";
            // Chapter 1 is always open; every chapter after that needs the
            // PREVIOUS one won, not just attempted — a loss or a draw
            // doesn't advance the story.
            const previousChapter = champion.chapters[i - 1];
            const unlocked = i === 0 || progress.get(`${champion.id}/${previousChapter.id}`)?.result === "win";

            const content = (
              <>
                <div
                  className="flex items-center justify-center rounded-full shrink-0 font-deco text-lg leading-none"
                  style={{ width: 40, height: 40, background: unlocked ? champion.color : "var(--muted-foreground)", color: "#fff" }}
                >
                  {unlocked ? i + 1 : <Lock size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{chapter.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {unlocked ? `Vs ${chapter.opponentName} · ELO ${chapter.eloTarget}` : `Gana el capítulo ${i} para desbloquear`}
                  </p>
                </div>
                {won && <CheckCircle2 size={18} style={{ color: "var(--bv-green)" }} className="shrink-0" />}
              </>
            );

            return unlocked ? (
              <Link
                key={chapter.id}
                href={`/campeones/${champion.id}/${chapter.id}`}
                className="deco-step flex items-center gap-4 p-4 border transition active:scale-[0.98]"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                {content}
              </Link>
            ) : (
              <div
                key={chapter.id}
                aria-disabled="true"
                className="deco-step flex items-center gap-4 p-4 border opacity-60"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
