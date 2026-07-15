// "Nacimiento de un Campeón" — a narrated, playable biography mode. Real
// public facts about real chess champions, dramatized into dialogue for an
// adventure-game feel. The dialogue itself (family banter, inner thoughts)
// is fictionalized — never presented as a verbatim quote — while the
// biographical facts it's built around (birthplace, age, titles, results)
// are real and verifiable. Each chapter shown to the player carries an
// explicit "hechos reales, diálogo dramatizado" disclaimer for exactly
// this reason.

export interface DialogueLine {
  speaker: string;
  text: string;
  side: "player" | "other"; // which side of the screen the bubble sits on
}

export interface Chapter {
  id: string;
  title: string;
  eloTarget: number;
  opponentName: string;
  opponentInitials: string;
  playerColor: "white" | "black";
  intro: DialogueLine[];
  outroWin: DialogueLine[];
  outroLoseOrDraw: DialogueLine[];
}

export interface Champion {
  id: string;
  name: string;
  years: string;
  tagline: string;
  color: string;
  initials: string;
  disclaimer: string;
  locked?: boolean;
  chapters: Chapter[];
}

export const CHAMPIONS: Champion[] = [
  {
    id: "judit-polgar",
    name: "Judit Polgár",
    years: "Húngara, n. 1976",
    tagline: "La mejor ajedrecista de la historia",
    color: "oklch(0.62 0.19 18)",
    initials: "JP",
    disclaimer: "Hechos reales — los diálogos están dramatizados para esta historia, no son citas textuales.",
    chapters: [
      {
        id: "mi-primera-partida",
        title: "Capítulo 1 · Mi primera partida",
        eloTarget: 200,
        opponentName: "Zsófia, tu hermana mayor",
        opponentInitials: "ZS",
        playerColor: "white",
        intro: [
          { speaker: "Narrador", text: "Budapest, principios de los años 80. En casa de los Polgár, el ajedrez no es un juego — es la lengua en la que se habla en familia.", side: "other" },
          { speaker: "László (papá)", text: "Judit, tienes cinco años y ya sabes mover las piezas. Hoy juegas tu primera partida de verdad. Contra tu hermana.", side: "other" },
          { speaker: "Zsófia", text: "No te voy a dejar ganar solo porque eres la pequeña.", side: "other" },
          { speaker: "Judit", text: "No necesito que me dejes. Solo necesito el primer movimiento.", side: "player" },
          { speaker: "László (papá)", text: "Así se habla. Recuerda: cada pieza que mueves tiene un plan. Encuéntralo.", side: "other" },
        ],
        outroWin: [
          { speaker: "Zsófia", text: "…¿Cómo viste eso? Ni siquiera yo lo vi venir.", side: "other" },
          { speaker: "László (papá)", text: "Esta niña ve el tablero distinto al resto de nosotros.", side: "other" },
          { speaker: "Judit", text: "Quiero jugar otra vez. Y otra. Y otra.", side: "player" },
          { speaker: "Narrador", text: "Fue la primera de miles de partidas. Once años después, Judit se convertiría en la Gran Maestra más joven de la historia — un récord que Bobby Fischer tuvo por más de dos décadas.", side: "other" },
        ],
        outroLoseOrDraw: [
          { speaker: "Zsófia", text: "Bien jugado — pero todavía te falta para ganarme.", side: "other" },
          { speaker: "László (papá)", text: "Perder una partida no te hace peor jugadora. Te hace estudiar más la siguiente.", side: "other" },
          { speaker: "Judit", text: "Otra vez. Esta vez la gano.", side: "player" },
        ],
      },
    ],
  },
  {
    id: "kasparov",
    name: "Garry Kaspárov",
    years: "n. 1963, Bakú",
    tagline: "El campeón mundial más joven de la historia",
    color: "oklch(0.55 0.18 255)",
    initials: "GK",
    disclaimer: "Hechos reales — los diálogos están dramatizados para esta historia, no son citas textuales.",
    locked: true,
    chapters: [],
  },
];

export function findChampion(id: string): Champion | undefined {
  return CHAMPIONS.find((c) => c.id === id);
}

export function findChapter(championId: string, chapterId: string): { champion: Champion; chapter: Chapter } | undefined {
  const champion = findChampion(championId);
  const chapter = champion?.chapters.find((c) => c.id === chapterId);
  if (!champion || !chapter) return undefined;
  return { champion, chapter };
}
