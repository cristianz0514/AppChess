import Link from "next/link";
import { getUsername } from "@/lib/getUsername";
import { getUserId } from "@/services/dashboardData";
import { getErrorExercises } from "@/services/errorTrainer";
import { ErrorTrainer } from "@/components/ErrorTrainer";
import { BackButton } from "@/components/BackButton";

export const metadata = { title: "Entrena tus errores" };

export default async function ErroresPage() {
  const username = await getUsername();
  const userId = await getUserId(username);
  if (!userId) return null;

  const exercises = await getErrorExercises(userId, 12);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <header className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 h-16 border-b"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <BackButton href="/entrenamiento" />
        <span className="font-bold text-base tracking-tight">Entrena tus errores</span>
      </header>

      <main className="flex-1 pt-20 px-4 max-w-lg mx-auto w-full overflow-y-auto">
        {exercises.length > 0 ? (
          <ErrorTrainer exercises={exercises} />
        ) : (
          <div className="text-center py-16 space-y-3">
            <p className="text-4xl">♟</p>
            <p className="text-sm font-semibold">Aún no hay errores para entrenar</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Analiza algunas de tus partidas y aquí aparecerán las posiciones donde perdiste ventaja, para que las vuelvas a jugar.
            </p>
            <Link href="/blunders" className="inline-block mt-2 text-sm font-bold" style={{ color: "var(--bv-electric)" }}>
              Ver mis partidas →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
