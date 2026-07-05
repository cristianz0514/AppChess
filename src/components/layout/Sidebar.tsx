"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Swords, Brain, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Inicio",       icon: LayoutDashboard },
  { href: "/openings",  label: "Aperturas",    icon: BookOpen },
  { href: "/blunders",  label: "Partidas",     icon: Swords },
  { href: "/insights",  label: "Coach IA",     icon: Brain },
  { href: "/stats",     label: "Estadísticas", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-semibold text-sm tracking-tight">AnaliChess</span>
        <span className="text-primary text-sm"> IA</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === href
                ? "font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
            style={pathname === href ? { background: "oklch(0.61 0.22 285 / 0.12)", color: "var(--bv-purple)" } : {}}
          >
            <Icon size={16} strokeWidth={pathname === href ? 2.2 : 1.8} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
