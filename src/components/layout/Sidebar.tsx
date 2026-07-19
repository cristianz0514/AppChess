"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Swords, Brain, Target, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard",      label: "Inicio",           icon: LayoutDashboard },
  { href: "/entrenamiento",  label: "Entrenamiento",    icon: Target },
  { href: "/openings",       label: "Aperturas",        icon: BookOpen },
  { href: "/blunders",       label: "Partidas",         icon: Swords },
  { href: "/insights",       label: "Coach IA",         icon: Brain },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-border flex items-center gap-2.5">
        <div className="deco-step-sm w-8 h-8 flex items-center justify-center shrink-0"
          style={{ background: "var(--bv-purple)" }}>
          <span className="text-white text-sm leading-none">♞</span>
        </div>
        <span className="font-deco text-base leading-none uppercase">AnaliChess<span style={{ color: "var(--bv-purple)" }}> IA</span></span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          // "Entrenamiento" covers its two sub-modes too, so it stays
          // highlighted while inside Practica el Mate or Campeones.
          const active = href === "/entrenamiento"
            ? pathname.startsWith("/entrenamiento") || pathname.startsWith("/practica-mate") || pathname.startsWith("/campeones")
            : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              style={active ? { background: "oklch(0.34 0.10 264 / 0.12)", color: "var(--bv-purple)" } : {}}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <Link href="/"
          className="deco-step-sm flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          style={{ background: "var(--bv-electric)" }}>
          <Plus size={16} strokeWidth={2.5} /> Importar partidas
        </Link>
      </div>
    </aside>
  );
}
