import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getChampionProgress } from "@/services/championProgress";
import { CHAMPIONS } from "@/lib/champions";
import { ChampionAvatar } from "@/components/ChampionAvatar";

export const metadata = { title: "Nacimiento de un Campeón" };

export default async function ChampionsPage() {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) notFound();

  const progress = await getChampionProgress(userId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <BackButton href="/entrenamiento" />
        <span className="font-bold text-base tracking-tight">Nacimiento de un Campeón</span>
      </header>

      <main className="flex-1 pt-24 px-4 max-w-lg mx-auto w-full pb-8 space-y-4">
        {/* A pawn's shadow already shaped like a queen — the whole mode in one
            image, better than any copy could say it. */}
        <div className="-mx-4 -mt-2 mb-1 overflow-hidden" style={{ maxHeight: 160 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset */}
          <img src="/campeones/hero-sombra-reina.jpg" alt="" className="w-full h-full object-cover" style={{ objectPosition: "center 30%" }} />
        </div>
        <p className="text-sm text-muted-foreground text-center text-balance">
          Elige una leyenda y revive su historia — desde sus primeras partidas hasta la cima del ajedrez mundial.
        </p>

        <div className="space-y-3">
          {CHAMPIONS.map((champion) => {
            const completedCount = champion.chapters.filter(
              (c) => progress.get(`${champion.id}/${c.id}`)?.result === "win",
            ).length;
            const allDone = champion.chapters.length > 0 && completedCount === champion.chapters.length;

            const content = (
              <>
                <ChampionAvatar initials={champion.initials} color={champion.color} size={64} locked={champion.locked} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold font-display">{champion.name}</p>
                  <p className="text-xs text-muted-foreground">{champion.years}</p>
                  {champion.locked ? (
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Próximamente</p>
                  ) : allDone ? (
                    <p className="text-xs mt-1 flex items-center gap-1.5 font-semibold" style={{ color: "var(--bv-green)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset */}
                      <img src="/campeones/medalla-oro.png" alt="" width={16} height={16} className="shrink-0" />
                      Completado
                    </p>
                  ) : completedCount > 0 ? (
                    // Not champion.color: it's an arbitrary per-champion brand
                    // hue never checked against 4.5:1 on white as body text —
                    // measured Judit's own at 4.0:1, a real contrast failure.
                    <p className="text-xs mt-1 font-semibold" style={{ color: "var(--muted-foreground)" }}>
                      {completedCount}/{champion.chapters.length} capítulos
                    </p>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{champion.tagline}</p>
                  )}
                </div>
                {champion.locked && <Lock size={16} className="text-muted-foreground shrink-0" />}
              </>
            );
            const className = "deco-step flex items-center gap-4 p-4 border transition active:scale-[0.98]";
            const style = { borderColor: "var(--border)", background: "var(--card)" };
            return champion.locked || champion.chapters.length === 0 ? (
              <div key={champion.id} className={`${className} opacity-70`} style={style}>{content}</div>
            ) : (
              <Link key={champion.id} href={`/campeones/${champion.id}`} className={className} style={style}>
                {content}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
