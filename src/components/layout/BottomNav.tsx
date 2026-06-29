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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch justify-around h-16">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 text-[10px] font-medium transition-colors active:opacity-60",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.8}
                className={active ? "text-foreground" : ""}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
