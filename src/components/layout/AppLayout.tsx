import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
