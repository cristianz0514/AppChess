import Link from "next/link";
import { Plus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";

interface Props {
  children: React.ReactNode;
  username?: string;
}

export function AppLayout({ children, username }: Props) {
  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : "BV";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top header */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--bv-purple)", color: "#fff" }}
          >
            {initials}
          </div>
          <span className="text-sm font-bold tracking-tight">AnaliChess IA</span>
          <Link href="/" aria-label="Importar partidas"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground active:scale-95">
            <Plus size={16} />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
