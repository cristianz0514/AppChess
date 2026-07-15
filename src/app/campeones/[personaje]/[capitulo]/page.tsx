import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { findChapter } from "@/lib/champions";
import { ChapterExperience } from "@/components/ChapterExperience";

interface Props {
  params: Promise<{ personaje: string; capitulo: string }>;
}

export default async function ChampionChapterPage({ params }: Props) {
  const { personaje, capitulo } = await params;
  const found = findChapter(personaje, capitulo);
  if (!found) notFound();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <Link href="/campeones" className="p-2 -ml-2 rounded-full transition-colors hover:bg-muted">
          <ChevronLeft size={20} />
        </Link>
        <span className="font-bold text-base tracking-tight">{found.champion.name}</span>
      </header>

      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto pb-8">
        <ChapterExperience champion={found.champion} chapter={found.chapter} />
      </main>
    </div>
  );
}
