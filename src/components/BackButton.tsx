import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Was copy-pasted across 8 header components at p-2 (36×36px) — under the
// WCAG 2.5.5 44×44px touch-target minimum, and now a single place to fix it.
// `href` omitted renders the same size as an inert placeholder, for loading
// skeletons that show the header shell before the real link is known.
export function BackButton({ href }: { href?: string }) {
  const className = "flex items-center justify-center -ml-2.5 rounded-full transition-colors hover:bg-muted";
  const style = { width: 44, height: 44 };
  if (!href) {
    return (
      <div className={`${className} text-muted-foreground`} style={style}>
        <ChevronLeft size={20} />
      </div>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      <ChevronLeft size={20} />
    </Link>
  );
}
