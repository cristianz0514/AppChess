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
          <span className="text-sm font-bold tracking-tight">BlunderVision</span>
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
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
