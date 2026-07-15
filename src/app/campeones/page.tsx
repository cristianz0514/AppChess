import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import { CHAMPIONS } from "@/lib/champions";
import { ChampionAvatar } from "@/components/ChampionAvatar";

export const metadata = { title: "Nacimiento de un Campeón" };

export default function ChampionsPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <Link href="/entrenamiento" className="p-2 -ml-2 rounded-full transition-colors hover:bg-muted">
          <ChevronLeft size={20} />
        </Link>
        <span className="font-bold text-base tracking-tight">Nacimiento de un Campeón</span>
      </header>

      <main className="flex-1 pt-24 px-4 max-w-lg mx-auto w-full pb-8 space-y-4">
        <p className="text-sm text-muted-foreground text-center text-balance">
          Elige una leyenda y revive su historia — desde sus primeras partidas hasta la cima del ajedrez mundial.
        </p>

        <div className="space-y-3">
          {CHAMPIONS.map((champion) => {
            const firstChapter = champion.chapters[0];
            const content = (
              <>
                <ChampionAvatar initials={champion.initials} color={champion.color} size={64} locked={champion.locked} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold font-display">{champion.name}</p>
                  <p className="text-xs text-muted-foreground">{champion.years}</p>
                  <p className="text-xs mt-1" style={{ color: champion.locked ? "var(--muted-foreground)" : champion.color }}>
                    {champion.locked ? "Próximamente" : champion.tagline}
                  </p>
                </div>
                {champion.locked && <Lock size={16} className="text-muted-foreground shrink-0" />}
              </>
            );
            const className = "flex items-center gap-4 p-4 rounded-2xl border transition active:scale-[0.98]";
            const style = { borderColor: "var(--border)", background: "var(--card)" };
            return champion.locked || !firstChapter ? (
              <div key={champion.id} className={`${className} opacity-70`} style={style}>{content}</div>
            ) : (
              <Link key={champion.id} href={`/campeones/${champion.id}/${firstChapter.id}`} className={className} style={style}>
                {content}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
