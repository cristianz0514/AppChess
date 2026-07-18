import Link from "next/link";
import { ChevronRight, Target, Crown } from "lucide-react";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Entrenamiento" };

// The knight button's destination — a small hub choosing between the two
// training modes instead of jumping straight into Practica el Mate, now
// that there's a second mode (Nacimiento de un Campeón) to reach from here.
export default function EntrenamientoPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <BackButton href="/dashboard" />
        <span className="font-bold text-base tracking-tight">Entrenamiento</span>
      </header>

      <main className="flex-1 pt-24 px-4 max-w-lg mx-auto w-full pb-8 space-y-3">
        <Link href="/practica-mate"
          className="flex items-center gap-4 p-4 rounded-2xl border transition active:scale-[0.98]"
          style={{ borderColor: "oklch(0.61 0.22 285 / 0.25)", background: "oklch(0.61 0.22 285 / 0.08)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.61 0.22 285 / 0.15)" }}>
            <Target size={22} style={{ color: "var(--bv-purple)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Practica el Mate</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ejercicios de mate forzado, incluidos algunos de tus partidas</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </Link>

        <Link href="/campeones"
          className="flex items-center gap-4 p-4 rounded-2xl border transition active:scale-[0.98]"
          style={{ borderColor: "oklch(0.62 0.19 18 / 0.25)", background: "oklch(0.62 0.19 18 / 0.08)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.62 0.19 18 / 0.15)" }}>
            <Crown size={22} style={{ color: "oklch(0.62 0.19 18)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Nacimiento de un Campeón</p>
            <p className="text-xs text-muted-foreground mt-0.5">Vive la historia de las leyendas del ajedrez y juega sus partidas</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </Link>
      </main>
    </div>
  );
}
