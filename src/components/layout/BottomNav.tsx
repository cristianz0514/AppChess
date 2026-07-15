"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Brain, Swords, BookOpen } from "lucide-react";
import { KnightBadge } from "../KnightBadge";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Inicio",       icon: LayoutDashboard },
  { href: "/blunders",  label: "Partidas",     icon: Swords },
  null,
  { href: "/insights",  label: "Coach IA",     icon: Brain },
  { href: "/openings",  label: "Aperturas",    icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          if (!item) {
            // The centerpiece action — training modes are the app's core
            // feature, so this gets the most prominent slot, not a buried
            // menu item. Opens the hub (Practica el Mate / Nacimiento de un
            // Campeón) instead of jumping straight into one mode.
            const onTraining = pathname.startsWith("/entrenamiento")
              || pathname.startsWith("/practica-mate")
              || pathname.startsWith("/campeones");
            return (
              <div key="fab" className="flex items-center justify-center flex-1">
                <Link href="/entrenamiento" className="-mt-5 active:scale-95 transition-transform" aria-label="Entrenamiento">
                  <KnightBadge active={onTraining} />
                </Link>
              </div>
            );
          }

          const { href, label, icon: Icon } = item;
          const active = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 text-[10px] font-medium transition-colors active:opacity-60",
                active ? "" : "text-muted-foreground"
              )}
              style={active ? { color: "var(--bv-purple)" } : {}}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
