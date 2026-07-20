import Link from "next/link";
import { ChevronRight, Target, Crown, Crosshair } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getUsername } from "@/lib/getUsername";

export const metadata = { title: "Entrenamiento" };

// The knight button's destination — a small hub choosing between the two
// training modes instead of jumping straight into Practica el Mate, now
// that there's a second mode (Nacimiento de un Campeón) to reach from here.
// Uses the same AppLayout chrome as every other primary section (Sidebar
// already lists "Entrenamiento" as a nav item, so it needs the same
// wayfinding, not a standalone header reachable only via the FAB).
export default async function EntrenamientoPage() {
  const username = await getUsername();

  return (
    <AppLayout username={username}>
      <div className="space-y-4 max-w-lg mx-auto"
        style={{ animation: "bvFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both" }}>

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Modo</p>
          <h1 className="font-deco text-2xl mt-0.5 uppercase">Entrenamiento</h1>
        </div>

        <div className="space-y-3">
          <Link href="/entrenamiento/errores"
            className="deco-step flex items-center gap-4 p-4 border transition active:scale-[0.98]"
            style={{ borderColor: "color-mix(in oklab, var(--bv-electric) 30%, transparent)", background: "color-mix(in oklab, var(--bv-electric) 8%, transparent)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "color-mix(in oklab, var(--bv-electric) 15%, transparent)" }}>
              <Crosshair size={22} style={{ color: "var(--bv-electric)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Entrena tus errores</p>
              <p className="text-xs text-muted-foreground mt-0.5">Vuelve a tus posiciones de blunder y encuentra la mejor jugada</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </Link>

          <Link href="/practica-mate"
            className="deco-step flex items-center gap-4 p-4 border transition active:scale-[0.98]"
            style={{ borderColor: "oklch(0.34 0.10 264 / 0.25)", background: "oklch(0.34 0.10 264 / 0.08)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.34 0.10 264 / 0.15)" }}>
              <Target size={22} style={{ color: "var(--bv-purple)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Practica el Mate</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ejercicios de mate forzado, incluidos algunos de tus partidas</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </Link>

          <Link href="/campeones"
            className="deco-step flex items-center gap-4 p-4 border transition active:scale-[0.98]"
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
        </div>

      </div>
    </AppLayout>
  );
}
