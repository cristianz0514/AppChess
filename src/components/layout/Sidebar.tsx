"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Swords, Lightbulb, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/openings",  label: "Openings",  icon: BookOpen },
  { href: "/blunders",  label: "Games",     icon: Swords },
  { href: "/insights",  label: "Insights",  icon: Lightbulb },
  { href: "/stats",     label: "Settings",  icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-semibold text-sm tracking-tight">BlunderVision</span>
        <span className="text-primary text-sm"> AI</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === href
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
