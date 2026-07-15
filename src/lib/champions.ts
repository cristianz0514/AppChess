// "Nacimiento de un Campeón" — a narrated, playable biography mode. Real
// public facts about real chess champions, dramatized into dialogue for an
// adventure-game feel. The dialogue itself (family banter, inner thoughts)
// is fictionalized — never presented as a verbatim quote — while the
// biographical facts it's built around (birthplace, age, titles, results)
// are real and verifiable. Each chapter shown to the player carries an
// explicit "hechos reales, diálogo dramatizado" disclaimer for exactly
// this reason.

import type { PortraitVariant } from "@/components/CharacterPortrait";
import type { SceneVariant } from "@/components/SceneBackground";

export interface DialogueLine {
  speaker: string;
  text: string;
  side: "player" | "other"; // which side of the screen the bubble sits on
  // Omitted = a narration/scene-setting line (no portrait, no bubble —
  // rendered as an italic caption instead of a character talking).
  portrait?: PortraitVariant;
}

export interface Chapter {
  id: string;
  title: string;
  eloTarget: number;
  opponentName: string;
  opponentPortrait: PortraitVariant;
  playerPortrait: PortraitVariant;
  playerColor: "white" | "black";
  scene: SceneVariant;
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

// The full 15-chapter arc for Judit, agreed with the user: ELO capped at
// 1900 (not the initially-proposed 2200), curve gentle through chapter 5
// then crossing into genuinely-hard territory from chapter 6 on (smaller
// numeric jumps near the top reflect that gaining ELO gets harder in real
// chess, not less dramatic). THIS IS THE SINGLE PLACE TO EDIT THE CURVE —
// change a row here and, for already-built chapters, the live Chapter
// below picks it up automatically since it reads eloTarget from this array
// instead of hardcoding its own number. Rows without a built chapter yet
// are the confirmed plan, not yet wired into CHAMPIONS.
export const JUDIT_ROADMAP: { id: string; title: string; eloTarget: number; opponent: string; note: string }[] = [
  { id: "mi-primera-partida", title: "Capítulo 1 · Mi primera partida", eloTarget: 200, opponent: "Zsófia, tu hermana mayor", note: "Primera partida en casa, 5 años" },
  { id: "el-primer-rival", title: "Capítulo 2 · El primer rival de verdad", eloTarget: 350, opponent: "Károly, niño de club", note: "Primer torneo fuera de casa" },
  { id: "torneo-infantil", title: "Capítulo 3 · El torneo infantil", eloTarget: 500, opponent: "rival de su categoría", note: "Primer torneo infantil oficial" },
  { id: "vencer-a-un-adulto", title: "Capítulo 4 · Vencer a un adulto", eloTarget: 650, opponent: "adulto de club", note: "Primera victoria contra un adulto" },
  { id: "la-nina-que-vence-a-un-maestro", title: "Capítulo 5 · La niña que vence a un Maestro", eloTarget: 800, opponent: "Maestro de club", note: "A los 9 años vence a su primer Maestro (hecho real)" },
  { id: "el-primer-viaje", title: "Capítulo 6 · El primer viaje", eloTarget: 950, opponent: "rival internacional", note: "Su primer torneo fuera de Hungría — arranca la dificultad real" },
  { id: "vencer-a-un-gran-maestro", title: "Capítulo 7 · Vencer a un Gran Maestro", eloTarget: 1100, opponent: "GM Dolfi Drimer", note: "1986, 10 años: la más joven en vencer a un GM" },
  { id: "las-hermanas-polgar", title: "Capítulo 8 · Las Hermanas Polgár", eloTarget: 1250, opponent: "Larisa, rival del equipo soviético", note: "Olimpiada de Ajedrez 1988, oro por equipos, 12 años" },
  { id: "la-maestra-internacional", title: "Capítulo 9 · La Maestra Internacional", eloTarget: 1400, opponent: "GM Varga", note: "Norma de MI, mejor mujer del mundo" },
  { id: "contra-los-grandes", title: "Capítulo 10 · Contra los grandes", eloTarget: 1500, opponent: "GM Suárez", note: "Primeras partidas serias contra GMs adultos" },
  { id: "la-carrera-contra-el-record", title: "Capítulo 11 · La carrera contra el récord", eloTarget: 1600, opponent: "GM Petrov", note: "Persiguiendo el récord de GM más joven de la historia" },
  { id: "gran-maestra-a-los-15", title: "Capítulo 12 · Gran Maestra a los 15", eloTarget: 1700, opponent: "GM Halász", note: "1991: rompe el récord de Bobby Fischer" },
  { id: "entrar-al-top-mundial", title: "Capítulo 13 · Entrar al top mundial", eloTarget: 1780, opponent: "Anatoli Kárpov", note: "Primeras victorias contra ex-campeones mundiales" },
  { id: "la-numero-8-del-mundo", title: "Capítulo 14 · La número 8 del mundo", eloTarget: 1850, opponent: "GM Ivanov", note: "2005: llega a ser #8 del ranking mundial" },
  { id: "el-dia-que-vencio-al-mejor-del-mundo", title: "Capítulo 15 · El día que venció al mejor del mundo", eloTarget: 1900, opponent: "Garry Kaspárov", note: "2002: vence a Kaspárov siendo #1 del mundo" },
];

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
        eloTarget: JUDIT_ROADMAP[0].eloTarget,
        opponentName: "Zsófia, tu hermana mayor",
        opponentPortrait: "zsofia",
        playerPortrait: "judit-child",
        playerColor: "white",
        scene: "living-room",
        intro: [
          { speaker: "Narrador", text: "Budapest, principios de los años 80. En casa de los Polgár, el ajedrez no es un juego — es la lengua en la que se habla en familia.", side: "other" },
          { speaker: "László (papá)", text: "Judit, tienes cinco años y ya sabes mover las piezas. Hoy juegas tu primera partida de verdad. Contra tu hermana.", side: "other", portrait: "laszlo" },
          { speaker: "Zsófia", text: "No te voy a dejar ganar solo porque eres la pequeña.", side: "other", portrait: "zsofia" },
          { speaker: "Judit", text: "No necesito que me dejes. Solo necesito el primer movimiento.", side: "player", portrait: "judit-child" },
          { speaker: "László (papá)", text: "Así se habla. Recuerda: cada pieza que mueves tiene un plan. Encuéntralo.", side: "other", portrait: "laszlo" },
        ],
        outroWin: [
          { speaker: "Zsófia", text: "…¿Cómo viste eso? Ni siquiera yo lo vi venir.", side: "other", portrait: "zsofia" },
          { speaker: "László (papá)", text: "Esta niña ve el tablero distinto al resto de nosotros.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Quiero jugar otra vez. Y otra. Y otra.", side: "player", portrait: "judit-child" },
          { speaker: "Narrador", text: "Fue la primera de miles de partidas. Once años después, Judit se convertiría en la Gran Maestra más joven de la historia — un récord que Bobby Fischer tuvo por más de dos décadas.", side: "other" },
        ],
        outroLoseOrDraw: [
          { speaker: "Zsófia", text: "Bien jugado — pero todavía te falta para ganarme.", side: "other", portrait: "zsofia" },
          { speaker: "László (papá)", text: "Perder una partida no te hace peor jugadora. Te hace estudiar más la siguiente.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Otra vez. Esta vez la gano.", side: "player", portrait: "judit-child" },
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
