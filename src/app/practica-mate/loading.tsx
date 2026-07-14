import { ChevronLeft } from "lucide-react";

// Matches the real page's dedicated shell (no AppLayout) so there's no
// header/layout flash when the real content streams in.
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 -ml-2 rounded-full text-muted-foreground">
            <ChevronLeft size={20} />
          </div>
          <span className="font-bold text-base tracking-tight">Practica el Mate</span>
        </div>
      </header>
      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto pb-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-2 bg-muted rounded-full" />
          <div className="h-40 bg-muted rounded-3xl mx-auto max-w-[280px]" />
          <div className="flex justify-center gap-8 pt-4">
            <div className="h-14 w-14 bg-muted rounded-full" />
            <div className="h-14 w-14 bg-muted rounded-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
