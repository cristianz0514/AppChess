import { AppLayout } from "@/components/layout/AppLayout";

export default function Loading() {
  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4 animate-pulse">
        <div className="h-2 bg-muted rounded-full" />
        <div className="h-40 bg-muted rounded-3xl mx-auto max-w-[280px]" />
        <div className="flex justify-center gap-8 pt-4">
          <div className="h-14 w-14 bg-muted rounded-full" />
          <div className="h-14 w-14 bg-muted rounded-full" />
        </div>
      </div>
    </AppLayout>
  );
}
