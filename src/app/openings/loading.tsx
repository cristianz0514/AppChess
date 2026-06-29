import { AppLayout } from "@/components/layout/AppLayout";

export default function Loading() {
  return (
    <AppLayout>
      <div className="space-y-4 max-w-lg mx-auto animate-pulse">
        <div className="h-8 w-40 bg-muted rounded-xl" />
        <div className="h-52 bg-muted rounded-2xl" />
        {[1,2,3,4].map(i => (
          <div key={i} className="h-16 bg-muted rounded-2xl" />
        ))}
      </div>
    </AppLayout>
  );
}
