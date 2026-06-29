import { AppLayout } from "@/components/layout/AppLayout";

export default function Loading() {
  return (
    <AppLayout>
      <div className="space-y-4 max-w-lg mx-auto animate-pulse">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 bg-muted rounded-xl" />
          <div className="h-16 bg-muted rounded-xl" />
          <div className="h-16 bg-muted rounded-xl" />
        </div>
        <div className="h-28 bg-muted rounded-2xl" />
        <div className="h-40 bg-muted rounded-2xl" />
        <div className="h-24 bg-muted rounded-2xl" />
      </div>
    </AppLayout>
  );
}
