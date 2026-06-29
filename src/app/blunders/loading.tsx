import { AppLayout } from "@/components/layout/AppLayout";

export default function Loading() {
  return (
    <AppLayout>
      <div className="space-y-3 max-w-lg mx-auto animate-pulse">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-20 bg-muted rounded-2xl" />
        ))}
      </div>
    </AppLayout>
  );
}
