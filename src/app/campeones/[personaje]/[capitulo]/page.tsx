import { notFound, redirect } from "next/navigation";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { findChapter } from "@/lib/champions";
import { getChampionProgress } from "@/services/championProgress";
import { ChapterExperience } from "@/components/ChapterExperience";
import { BackButton } from "@/components/BackButton";

interface Props {
  params: Promise<{ personaje: string; capitulo: string }>;
}

export default async function ChampionChapterPage({ params }: Props) {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) notFound();

  const { personaje, capitulo } = await params;
  const found = findChapter(personaje, capitulo);
  if (!found) notFound();

  // Same rule as the chapter list: chapter 1 is always open, every chapter
  // after that needs the PREVIOUS one WON — enforced here too, not just in
  // the list UI, so a direct URL can't skip the progression.
  const chapterIndex = found.champion.chapters.findIndex((c) => c.id === found.chapter.id);
  if (chapterIndex > 0) {
    const progress = await getChampionProgress(userId);
    const previousChapter = found.champion.chapters[chapterIndex - 1];
    const wonPrevious = progress.get(`${found.champion.id}/${previousChapter.id}`)?.result === "win";
    if (!wonPrevious) redirect(`/campeones/${personaje}`);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <BackButton href={`/campeones/${personaje}`} />
        <span className="font-bold text-base tracking-tight">{found.champion.name}</span>
      </header>

      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto pb-8">
        <ChapterExperience champion={found.champion} chapter={found.chapter} userId={userId} />
      </main>
    </div>
  );
}
