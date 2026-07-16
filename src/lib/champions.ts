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
  // A one-off illustration shown above a narration line — for the handful of
  // moments with real standalone art (a newspaper clipping, a chess clock)
  // instead of a character portrait. Path under /public/campeones/.
  image?: string;
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
          { speaker: "Zsófia", text: "No te voy a dejar ganar solo porque eres la pequeña.", side: "other", portrait: "zsofia-guino" },
          { speaker: "Judit", text: "No necesito que me dejes. Solo necesito el primer movimiento.", side: "player", portrait: "judit-child" },
          { speaker: "László (papá)", text: "Así se habla. Recuerda: cada pieza que mueves tiene un plan. Encuéntralo.", side: "other", portrait: "laszlo-pensativo" },
        ],
        outroWin: [
          { speaker: "Zsófia", text: "…¿Cómo viste eso? Ni siquiera yo lo vi venir.", side: "other", portrait: "zsofia-sorpresa" },
          { speaker: "László (papá)", text: "Esta niña ve el tablero distinto al resto de nosotros.", side: "other", portrait: "laszlo-orgulloso" },
          { speaker: "Judit", text: "Quiero jugar otra vez. Y otra. Y otra.", side: "player", portrait: "judit-child" },
          { speaker: "Narrador", text: "Fue la primera de miles de partidas. Once años después, Judit se convertiría en la Gran Maestra más joven de la historia — un récord que Bobby Fischer tuvo por más de dos décadas.", side: "other" },
        ],
        outroLoseOrDraw: [
          { speaker: "Zsófia", text: "Bien jugado — pero todavía te falta para ganarme.", side: "other", portrait: "zsofia" },
          { speaker: "László (papá)", text: "Perder una partida no te hace peor jugadora. Te hace estudiar más la siguiente.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Otra vez. Esta vez la gano.", side: "player", portrait: "judit-child" },
        ],
      },
      {
        id: "el-primer-rival",
        title: "Capítulo 2 · El primer rival de verdad",
        eloTarget: JUDIT_ROADMAP[1].eloTarget,
        opponentName: "Károly, niño de club",
        opponentPortrait: "karoly",
        playerPortrait: "judit-child",
        playerColor: "white",
        scene: "club",
        intro: [
          { speaker: "Narrador", text: "Meses después de aquella primera partida en casa, László decide que es hora de que Judit juegue contra alguien fuera de la familia — en el club de ajedrez del barrio.", side: "other" },
          { speaker: "László (papá)", text: "Hoy no juegas contra tu hermana. Aquí nadie te va a dejar ganar por cariño.", side: "other", portrait: "laszlo" },
          { speaker: "Károly", text: "¿Esta es la niña de la que todos hablan? No parece gran cosa.", side: "other", portrait: "karoly" },
          { speaker: "Judit", text: "Entonces no debería costarte tanto ganarme.", side: "player", portrait: "judit-child" },
          { speaker: "László (papá)", text: "Concéntrate. Aquí todos han jugado más partidas que tú. Tu ventaja es que piensas distinto.", side: "other", portrait: "laszlo" },
        ],
        outroWin: [
          { speaker: "Károly", text: "…No entiendo cómo una niña de seis años juega así.", side: "other", portrait: "karoly-sorpresa" },
          { speaker: "László (papá)", text: "Te dije que no era por cariño. Es real.", side: "other", portrait: "laszlo-orgulloso" },
          { speaker: "Judit", text: "Quiero jugar contra el siguiente.", side: "player", portrait: "judit-child" },
          { speaker: "Narrador", text: "La noticia corrió rápido por el club: había una niña que vencía a rivales con el doble de experiencia que ella.", side: "other" },
        ],
        outroLoseOrDraw: [
          { speaker: "Károly", text: "Jugaste mejor de lo que esperaba. Pero esta vez gano yo.", side: "other", portrait: "karoly-satisfecho" },
          { speaker: "László (papá)", text: "Aquí nadie te regala nada — por eso cuenta más cuando ganes.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "La próxima vez no tendrás esa suerte.", side: "player", portrait: "judit-child" },
        ],
      },
      {
        id: "torneo-infantil",
        title: "Capítulo 3 · El torneo infantil",
        eloTarget: JUDIT_ROADMAP[2].eloTarget,
        opponentName: "Eszter, rival de su categoría",
        opponentPortrait: "eszter",
        playerPortrait: "judit-child",
        playerColor: "white",
        scene: "torneo-infantil",
        intro: [
          { speaker: "Narrador", text: "El primer torneo infantil oficial de Judit — decenas de niños, relojes de verdad, y un panel de resultados donde cada partida cuenta.", side: "other" },
          { speaker: "László (papá)", text: "Aquí ya no importa cuántos años tienes. Solo importa el tablero.", side: "other", portrait: "laszlo" },
          { speaker: "Eszter", text: "Llevo dos años jugando torneos. ¿Tú cuántos llevas?", side: "other", portrait: "eszter" },
          { speaker: "Judit", text: "Los que hagan falta para ganar este.", side: "player", portrait: "judit-child" },
        ],
        outroWin: [
          { speaker: "Eszter", text: "…No esperaba perder contra alguien más pequeña que yo.", side: "other", portrait: "eszter-sorpresa" },
          { speaker: "László (papá)", text: "El tamaño nunca fue el problema, ¿verdad?", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Nunca lo fue.", side: "player", portrait: "judit-child" },
        ],
        outroLoseOrDraw: [
          { speaker: "Eszter", text: "Fue muy cerrada. Casi me ganas.", side: "other", portrait: "eszter-satisfecho" },
          { speaker: "László (papá)", text: "Casi no cuenta en el torneo, pero sí cuenta para la próxima vez.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "La próxima vez no habrá 'casi'.", side: "player", portrait: "judit-child" },
        ],
      },
      {
        id: "vencer-a-un-adulto",
        title: "Capítulo 4 · Vencer a un adulto",
        eloTarget: JUDIT_ROADMAP[3].eloTarget,
        opponentName: "Nagy, adulto de club",
        opponentPortrait: "nagy",
        playerPortrait: "judit-child",
        playerColor: "black",
        scene: "club",
        intro: [
          { speaker: "Narrador", text: "De vuelta en el club — pero esta vez László la sienta frente a un adulto, un jugador con años de experiencia sobre el tablero.", side: "other" },
          { speaker: "Nagy", text: "¿En serio quieren que juegue contra la niña? No quiero avergonzarla.", side: "other", portrait: "nagy" },
          { speaker: "László (papá)", text: "Juegue en serio, Nagy. Es lo único que le pido.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Yo también quiero que juegue en serio.", side: "player", portrait: "judit-child" },
        ],
        outroWin: [
          { speaker: "Nagy", text: "…Llevo veinte años jugando. Nunca había visto algo así.", side: "other", portrait: "nagy-sorpresa" },
          { speaker: "László (papá)", text: "Ahora ya lo sabe: aquí no hay favores, solo ajedrez.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Gracias por no dejarme ganar.", side: "player", portrait: "judit-child" },
        ],
        outroLoseOrDraw: [
          { speaker: "Nagy", text: "La experiencia todavía cuenta para algo, pequeña.", side: "other", portrait: "nagy-satisfecho" },
          { speaker: "László (papá)", text: "Por ahora. No por mucho tiempo, me parece.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "La próxima vez la experiencia no le va a alcanzar.", side: "player", portrait: "judit-child" },
        ],
      },
      {
        id: "la-nina-que-vence-a-un-maestro",
        title: "Capítulo 5 · La niña que vence a un Maestro",
        eloTarget: JUDIT_ROADMAP[4].eloTarget,
        opponentName: "Maestro de club",
        opponentPortrait: "maestro",
        playerPortrait: "judit-child",
        playerColor: "white",
        scene: "club",
        intro: [
          { speaker: "Narrador", text: "A sus nueve años, Judit se sienta frente a un Maestro con título oficial — la clase de rival contra el que la mayoría de los niños de club nunca llega a jugar.", side: "other" },
          { speaker: "Maestro", text: "He entrenado a decenas de jugadores. Curiosidad me trae a esta mesa, no preocupación.", side: "other", portrait: "maestro" },
          { speaker: "Judit", text: "Entonces que la curiosidad no le quite concentración.", side: "player", portrait: "judit-child" },
        ],
        outroWin: [
          { speaker: "Maestro", text: "…Con nueve años acaba de vencer a un Maestro. Recuerde esta partida — yo la voy a recordar.", side: "other", portrait: "maestro-sorpresa" },
          { speaker: "László (papá)", text: "Esto ya no es una promesa, Judit. Es un hecho.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Entonces sigamos construyendo hechos.", side: "player", portrait: "judit-child" },
        ],
        outroLoseOrDraw: [
          { speaker: "Maestro", text: "El título no es solo un papel. Hoy se lo demostré.", side: "other", portrait: "maestro-satisfecho" },
          { speaker: "Judit", text: "Y yo aprendí exactamente dónde me falta.", side: "player", portrait: "judit-child" },
        ],
      },
      {
        id: "el-primer-viaje",
        title: "Capítulo 6 · El primer viaje",
        eloTarget: JUDIT_ROADMAP[5].eloTarget,
        opponentName: "Rival internacional",
        opponentPortrait: "rival-internacional",
        playerPortrait: "judit-teen",
        playerColor: "white",
        scene: "torneo-internacional",
        intro: [
          { speaker: "Narrador", text: "El primer torneo fuera de Hungría. Banderas de países que Judit solo había visto en mapas, y un salón mucho más grande e intimidante que cualquier club de Budapest.", side: "other" },
          { speaker: "László (papá)", text: "Aquí nadie sabe quién eres todavía. Eso también es una ventaja.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Para cuando termine el torneo, lo van a saber.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "Narrador", text: "Ganó. Y por primera vez, un rival de otro país aprendió su nombre de la peor manera posible: perdiéndole.", side: "other" },
          { speaker: "László (papá)", text: "Esto era solo el primer paso, Judit. Hay mucho más mundo allá afuera.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Entonces vamos por el siguiente paso.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "László (papá)", text: "Jugar fuera de casa es distinto. Se aprende perdiendo también.", side: "other", portrait: "laszlo" },
          { speaker: "Judit", text: "Entonces ya aprendí lo que necesitaba.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "vencer-a-un-gran-maestro",
        title: "Capítulo 7 · Vencer a un Gran Maestro",
        eloTarget: JUDIT_ROADMAP[6].eloTarget,
        opponentName: "GM Dolfi Drimer",
        opponentPortrait: "drimer",
        playerPortrait: "judit-teen",
        playerColor: "black",
        scene: "torneo-internacional",
        intro: [
          { speaker: "Narrador", text: "1986. Judit tiene diez años y está sentada frente a un Gran Maestro de verdad — un título que la mayoría de los jugadores nunca alcanza en toda su carrera.", side: "other" },
          { speaker: "GM Drimer", text: "He jugado contra cientos de rivales. Nunca contra una de diez años.", side: "other", portrait: "drimer" },
          { speaker: "Judit", text: "Entonces esta partida es nueva para los dos.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "GM Drimer", text: "…Felicidades. Acaba de vencer a un Gran Maestro con diez años.", side: "other", portrait: "drimer-sorpresa" },
          { speaker: "Narrador", text: "Judit se convirtió en la jugadora más joven de la historia en vencer a un Gran Maestro en una partida oficial.", side: "other" },
          { speaker: "Judit", text: "No va a ser la última vez.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "GM Drimer", text: "El título de Gran Maestro no es solo un nombre. Hoy lo sintió en el tablero.", side: "other", portrait: "drimer-satisfecho" },
          { speaker: "Judit", text: "Y ahora sé exactamente lo que tengo que superar.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "las-hermanas-polgar",
        title: "Capítulo 8 · Las Hermanas Polgár",
        eloTarget: JUDIT_ROADMAP[7].eloTarget,
        opponentName: "Larisa, rival del equipo soviético",
        opponentPortrait: "larisa",
        playerPortrait: "judit-teen",
        playerColor: "white",
        scene: "olimpiada",
        intro: [
          { speaker: "Narrador", text: "Olimpiada de Ajedrez, 1988. Judit juega junto a sus hermanas Zsuzsa y Zsófia por el equipo húngaro — frente al equipo soviético, el más temido del mundo.", side: "other" },
          { speaker: "Larisa", text: "El equipo soviético no ha perdido este título en décadas. Tenlo presente.", side: "other", portrait: "larisa" },
          { speaker: "Judit", text: "Todo récord tiene una primera vez en que se rompe.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "Larisa", text: "…Eras la rival más fuerte que he enfrentado en un equipo.", side: "other", portrait: "larisa-sorpresa" },
          { speaker: "Narrador", text: "Hungría venció a la Unión Soviética y se llevó el oro por equipos — con Judit, de doce años, jugando un papel decisivo.", side: "other", image: "/campeones/periodico-polgar.jpg" },
          { speaker: "Judit", text: "Ganamos juntas. Así se siente mejor.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "Larisa", text: "El equipo soviético sigue siendo el equipo soviético. Pero fue una partida difícil.", side: "other", portrait: "larisa-satisfecho" },
          { speaker: "Judit", text: "Difícil hoy. La próxima vez, distinto.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "la-maestra-internacional",
        title: "Capítulo 9 · La Maestra Internacional",
        eloTarget: JUDIT_ROADMAP[8].eloTarget,
        opponentName: "GM Varga",
        opponentPortrait: "varga",
        playerPortrait: "judit-teen",
        playerColor: "black",
        scene: "torneo-internacional",
        intro: [
          { speaker: "Narrador", text: "Una norma de Maestra Internacional está en juego — y con ella, el título de mejor jugadora del mundo por edad.", side: "other" },
          { speaker: "GM Varga", text: "Perder esta partida contra usted sería vergonzoso para mí. Así que no pienso perderla.", side: "other", portrait: "varga" },
          { speaker: "Judit", text: "Entonces los dos tenemos algo que perder.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "GM Varga", text: "…La vergüenza ya no importa. Lo que acabo de ver sí.", side: "other", portrait: "varga-sorpresa" },
          { speaker: "Narrador", text: "Con esta norma, Judit se convirtió en la mejor jugadora del mundo por su edad.", side: "other" },
          { speaker: "Judit", text: "Esto es solo el principio de lo que quiero lograr.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "GM Varga", text: "Esta vez me salvé. La próxima, no le prometo nada.", side: "other", portrait: "varga-satisfecho" },
          { speaker: "Judit", text: "No hace falta que me lo prometa. Yo se lo voy a demostrar.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "contra-los-grandes",
        title: "Capítulo 10 · Contra los grandes",
        eloTarget: JUDIT_ROADMAP[9].eloTarget,
        opponentName: "GM Suárez",
        opponentPortrait: "suarez",
        playerPortrait: "judit-teen",
        playerColor: "white",
        scene: "torneo-internacional",
        intro: [
          { speaker: "Narrador", text: "Las partidas ya no son contra promesas ni debutantes — ahora Judit se sienta frente a los Grandes Maestros del circuito élite mundial.", side: "other" },
          { speaker: "GM Suárez", text: "He jugado contra campeones del mundo. Esto debería ser un trámite.", side: "other", portrait: "suarez" },
          { speaker: "Judit", text: "'Debería' es una palabra peligrosa antes de jugar conmigo.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "GM Suárez", text: "…Retiro lo de 'trámite'.", side: "other", portrait: "suarez-sorpresa" },
          { speaker: "Judit", text: "Aceptado.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "GM Suárez", text: "La experiencia contra los grandes se gana perdiendo contra ellos primero.", side: "other", portrait: "suarez-satisfecho" },
          { speaker: "Judit", text: "Entonces ya empecé a ganarla.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "la-carrera-contra-el-record",
        title: "Capítulo 11 · La carrera contra el récord",
        eloTarget: JUDIT_ROADMAP[10].eloTarget,
        opponentName: "GM Petrov",
        opponentPortrait: "petrov",
        playerPortrait: "judit-teen",
        playerColor: "black",
        scene: "torneo-internacional",
        intro: [
          { speaker: "Narrador", text: "El récord de Gran Maestro más joven de la historia lleva más de veinte años en manos de Bobby Fischer. Judit está a un paso de romperlo.", side: "other", image: "/campeones/reloj-ajedrez.jpg" },
          { speaker: "GM Petrov", text: "Sabe lo que está en juego en esta partida, ¿verdad?", side: "other", portrait: "petrov" },
          { speaker: "Judit", text: "Lo sé. Por eso no pienso dejarlo pasar.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "GM Petrov", text: "…Acabo de ser parte de un récord histórico. Del lado equivocado.", side: "other", portrait: "petrov-sorpresa" },
          { speaker: "Narrador", text: "Judit quedó a un solo resultado de romper el récord de Bobby Fischer como el Gran Maestro más joven de la historia.", side: "other" },
          { speaker: "Judit", text: "Un paso más.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "GM Petrov", text: "El récord va a tener que esperar un poco más.", side: "other", portrait: "petrov-satisfecho" },
          { speaker: "Judit", text: "Esperar no es lo mismo que no llegar.", side: "player", portrait: "judit-teen" },
        ],
      },
      {
        id: "gran-maestra-a-los-15",
        title: "Capítulo 12 · Gran Maestra a los 15",
        eloTarget: JUDIT_ROADMAP[11].eloTarget,
        opponentName: "GM Halász",
        opponentPortrait: "halasz",
        playerPortrait: "judit-teen",
        playerColor: "white",
        scene: "premiacion",
        intro: [
          { speaker: "Narrador", text: "1991. La última partida que necesita para completar su norma de Gran Maestra — y con ella, romper un récord que llevaba más de veinte años intacto.", side: "other" },
          { speaker: "GM Halász", text: "Después de esta partida, uno de los dos entra en los libros de historia.", side: "other", portrait: "halasz" },
          { speaker: "Judit", text: "Entonces vamos a escribirlo.", side: "player", portrait: "judit-teen" },
        ],
        outroWin: [
          { speaker: "GM Halász", text: "…Felicidades, Gran Maestra Polgár. Ya nadie le puede quitar eso.", side: "other", portrait: "halasz-sorpresa" },
          { speaker: "Narrador", text: "A los 15 años y 4 meses, Judit Polgár rompió el récord de Bobby Fischer y se convirtió en la Gran Maestra más joven de la historia.", side: "other" },
          { speaker: "Judit", text: "Esto no es el final. Apenas estoy empezando.", side: "player", portrait: "judit-teen" },
        ],
        outroLoseOrDraw: [
          { speaker: "GM Halász", text: "El récord sigue esperando a alguien. Hoy no fue el día.", side: "other", portrait: "halasz" },
          { speaker: "Judit", text: "Habrá otro día. Y otra partida.", side: "player", portrait: "judit-teen" },
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
