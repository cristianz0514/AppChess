// Deterministic coach comments — template-based NLG, no LLM in the main path.
//
// Why templates instead of the model: chess.com's own Game Review text is
// template-interpolated (its Spanish has slot-seam grammar bugs like "Tu mejor
// opción era ataca el centro con un peón" — an LLM never writes that). Their
// comments read well precisely BECAUSE they're deterministic: short,
// consistent, and incapable of hallucinating. Depth comes from classifying the
// situation well and naming the concrete consequence, not from prose skill.
//
// Structure (conditional composition): a comment is assembled from independent
// slots, each rendered only when its data is verified.
//   A — what happened (always)
//   B — how the game changed (sometimes)
//   C — what was better (sometimes)
// At most TWO slots render, so the result stays chess.com-short. A handful of
// written fragments therefore produce hundreds of distinct comments.

export interface Motif {
  key: string;        // fork | pin | skewer | discovered | hanging | hangs_own
  label: string;      // Spanish term ("horquilla", "clavada"…)
  piece?: string;     // Spanish piece name
  square?: string;
}

export interface MoveFacts {
  variantSeed: number;        // stable per move (use the ply) so text never flickers

  playedPiece: string;        // Spanish piece name of the moved piece
  playedTo: string;
  isMate: boolean;
  capturedPiece: string | null;

  classification: string | null;
  good: boolean;

  evalBefore: number;         // player's perspective, pawns (mate ≈ ±10000)
  evalAfter: number;

  bestPiece: string | null;
  bestTo: string | null;
  bestCapturedPiece: string | null;
  bestGivesCheck: boolean;
  bestIsCastle: boolean;
  bestIsCenterPawn: boolean;  // pawn move into d4/e4/d5/e5
  bestDefendsHung: boolean;   // the best move defends the piece you left hanging
  onlyGoodMove: boolean;
  missedForcedMate: boolean;

  selfHang: { piece: string; square: string } | null;
  playedMotifs: Motif[];      // threats the played move created
  bestMotifs: Motif[];        // threats the best move would have created

  materialLostPiece: string | null;  // biggest piece lost in the punishment line
  materialNet: number;               // pawns the player ends up down
  materialSettled: boolean;          // line doesn't end mid-exchange
  materialTrades: boolean;

  oppCapturesPiece: string | null;   // piece the opponent's reply captures
  isSacrificeConfirmed: boolean;

  // Quiet-move shape. Set for EVERY move (it's free — no engine needed), so
  // ordinary moves get a real sentence instead of the old terse fallback
  // ("Equilibrio (+0.2)."). chess.com comments every move; capping commentary
  // only made sense while each one cost an engine search plus an LLM call.
  isCastle?: boolean;
  isPromotion?: boolean;
  developsPiece?: boolean;   // knight/bishop leaving its starting square
  toCenter?: boolean;        // lands on d4/e4/d5/e5
  gaveCheck?: boolean;
  isBook?: boolean;          // still inside a known opening line
  // Verdict on a capture: pure material arithmetic (what you take vs what the
  // recapture costs you). Turns "Capturas la torre en d4" — which describes
  // without teaching — into "un cambio parejo" / "y ganas material".
  tradeVerdict?: "gana" | "pareja" | "pierde" | null;
  trappedPiece?: { piece: string; square: string } | null; // yours, no safe square
  backRankRisk?: boolean;    // your king is boxed in on its own back rank
  // A tactic the OPPONENT's best reply now lands against you (fork, pin,
  // skewer, discovered attack). Naming it beats the "pierdes el hilo" wildcard:
  // it tells the player exactly what they walked into.
  allowsMotif?: Motif | null;
  // Positional signals, chosen from a diagnosis of which real moves were
  // falling through to the wildcards — not guessed. In two games the wildcard
  // moves clustered on: pawn moves in front of the castled king, piece
  // retreats, and knights going to the rim.
  weakensKingShield?: boolean; // moved a pawn shielding your own castled king
  retreats?: boolean;          // the piece moved backwards
  knightToRim?: boolean;       // knight to the a- or h-file
  givesKingLuft?: boolean;     // king step that opens an escape square
  rookToOpenFile?: boolean;    // rook lands on a file with no pawns
  rookToSeventh?: boolean;     // rook reaches the 7th/2nd rank
  doublesRooks?: boolean;      // second rook joins the first on a file
  fianchetto?: boolean;        // bishop to b2/g2/b7/g7
  isRecapture?: boolean;       // retakes on the square just captured on
  kingToCenter?: boolean;      // king wanders centre-ward outside the endgame
}

const ART: Record<string, string> = {
  "peón": "el peón", caballo: "el caballo", alfil: "el alfil",
  torre: "la torre", dama: "la dama", rey: "el rey",
};
const art = (p: string | null | undefined) => (p ? ART[p] ?? `el ${p}` : "la pieza");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Motif labels carry their own article because Spanish gender isn't guessable
// from the word: "una horquilla" but "un pincho". A blanket `una ${label}`
// produced "una pincho".
const MOTIF_ART: Record<string, string> = {
  horquilla: "una horquilla",
  clavada: "una clavada",
  pincho: "un pincho",
  "ataque a la descubierta": "un ataque a la descubierta",
  "doble amenaza": "una doble amenaza",
  "doble amenaza con jaque": "una doble amenaza con jaque",
};
const motifArt = (label: string) => MOTIF_ART[label] ?? `una ${label}`;

// "pieza colgada" is not a tactic you *execute* — it's a piece sitting there
// undefended. It needs its own phrasing instead of "montabas una pieza colgada".
const isHanging = (m: Motif) => m.key === "hanging" || m.key === "hangs_own";
function hangingPhrase(m: Motif): string {
  return m.piece && m.square
    ? `podías capturar ${art(m.piece)} de ${m.square}, que estaba sin defensa`
    : `había una pieza sin defensa`;
}
// Stable pick — the same move always renders the same text, but different moves
// rotate through the variants so consecutive comments don't read as one mold.
const pick = (variants: string[], seed: number) => variants[Math.abs(seed) % variants.length];

const MATE_MAG = 90; // |eval| at/above this means mate, not a pawn count

type Band = "perdida" | "peor" | "igualada" | "mejor" | "ganando";
function band(e: number): Band {
  if (e <= -3) return "perdida";
  if (e <= -1) return "peor";
  if (e < 1) return "igualada";
  if (e < 3) return "mejor";
  return "ganando";
}

// Descriptive tier for moves the engine did NOT flag as errors. Needs no engine
// search — just the move's own shape plus the shallow eval — which is why every
// move can afford a comment now. Book moves get chess.com's "jugada de libro"
// treatment instead of a fourth repeat of "sacas la pieza y ganas actividad".
function quietComment(f: MoveFacts): { text: string; namesMaterial: boolean } {
  const s = f.variantSeed;
  const where = band(f.evalAfter);
  const standing =
    where === "ganando" ? "con ventaja decisiva" : where === "mejor" ? "con ventaja" :
    where === "igualada" ? "en una posición equilibrada" : where === "peor" ? "aún en desventaja" :
    "en una posición muy difícil";

  if (f.isBook) {
    if (f.isCastle) return { text: `Jugada de libro: enrocas y pones el rey a salvo.`, namesMaterial: false };
    if (f.developsPiece) return { text: pick([
      `Jugada de libro: sacas ${art(f.playedPiece)} a ${f.playedTo}, desarrollo normal de la apertura.`,
      `Teoría: ${art(f.playedPiece)} va a ${f.playedTo} para entrar en juego.`,
    ], s), namesMaterial: false };
    if (f.toCenter) return { text: `Jugada de libro: disputas el centro con ${art(f.playedPiece)} en ${f.playedTo}.`, namesMaterial: false };
    return { text: pick([
      `Jugada de libro: ${art(f.playedPiece)} a ${f.playedTo} sigue la teoría.`,
      `Teoría de la apertura, ${art(f.playedPiece)} a ${f.playedTo}.`,
    ], s), namesMaterial: false };
  }

  if (f.isPromotion) return { text: `Coronas en ${f.playedTo} y quedas ${standing}.`, namesMaterial: true };
  if (f.isCastle) return { text: pick([`Enrocas y pones el rey a salvo.`, `Enrocas: el rey queda protegido y la torre entra en juego.`], s), namesMaterial: false };
  if (f.capturedPiece) {
    const cp = art(f.capturedPiece);
    if (f.tradeVerdict === "gana") return { text: pick([
      `Capturas ${cp} en ${f.playedTo} y ganas material.`,
      // No clitic pronoun here: "…recuperarlo" disagreed with feminine pieces
      // ("la dama … recuperarlo").
      `Te llevas ${cp} de ${f.playedTo} sin compensación para el rival.`,
    ], s), namesMaterial: true };
    if (f.tradeVerdict === "pareja") return { text: pick([
      `Cambias ${cp} en ${f.playedTo}: un cambio parejo.`,
      // `standing` can itself be "en una posición equilibrada", which read as
      // "Cambio equilibrado … posición equilibrada".
      `Cambio parejo en ${f.playedTo}.`,
    ], s), namesMaterial: true };
    return { text: pick([
      `Capturas ${cp} en ${f.playedTo}.`,
      `Te llevas ${cp} y quedas ${standing}.`,
    ], s), namesMaterial: true };
  }
  if (f.gaveCheck) return { text: `Das jaque con ${art(f.playedPiece)} y quedas ${standing}.`, namesMaterial: false };
  // King sidestep that opens an escape square — a real, nameable idea that was
  // landing on "Jugada sólida" before.
  if (f.givesKingLuft) return { text: pick([
    `Le das aire a tu rey: ahora tiene casilla de escape.`,
    `Mueves el rey a ${f.playedTo} y evitas sustos en la última fila.`,
  ], s), namesMaterial: false };
  if (f.retreats) return { text: pick([
    `Repliegas ${art(f.playedPiece)} a ${f.playedTo} para reagrupar.`,
    `Retiras ${art(f.playedPiece)} a ${f.playedTo}.`,
  ], s), namesMaterial: false };
  if (f.rookToSeventh) return { text: pick([
    `Metes la torre en la séptima: desde ${f.playedTo} muerde los peones y encierra al rey.`,
    `Torre a la séptima. Es la fila donde más daño hace.`,
  ], s), namesMaterial: false };
  if (f.doublesRooks) return { text: `Doblas las torres en la columna ${f.playedTo[0]}: juntas pesan mucho más.`, namesMaterial: false };
  if (f.rookToOpenFile) return { text: pick([
    `Colocas la torre en la columna ${f.playedTo[0]}, que está abierta.`,
    `La torre toma la columna abierta ${f.playedTo[0]}.`,
  ], s), namesMaterial: false };
  if (f.fianchetto) return { text: `Fianchetto: el alfil a ${f.playedTo} apunta a la diagonal larga.`, namesMaterial: false };
  if (f.developsPiece) return { text: pick([
    `Desarrollas ${art(f.playedPiece)} a ${f.playedTo}.`,
    `Sacas ${art(f.playedPiece)} a ${f.playedTo} y ganas actividad.`,
  ], s), namesMaterial: false };
  if (f.toCenter) return { text: `Ocupas el centro con ${art(f.playedPiece)} en ${f.playedTo}.`, namesMaterial: false };
  return { text: pick([
    `${cap(art(f.playedPiece))} a ${f.playedTo}: sigues ${standing}.`,
    `Jugada sólida, quedas ${standing}.`,
  ], s), namesMaterial: false };
}

// ── Slot A — what happened ───────────────────────────────────────────────────
// Ordered by how much it explains: a named material consequence beats a vague
// "you lost some advantage" every time.
function slotA(f: MoveFacts): { text: string; namesMaterial: boolean; usedBestMotif?: boolean } | null {
  const s = f.variantSeed;

  if (f.isMate && f.evalAfter > 0) {
    return { text: pick([
      `¡Jaque mate! ${cap(art(f.playedPiece))} remata en ${f.playedTo}.`,
      `¡Jaque mate con ${art(f.playedPiece)} en ${f.playedTo}! Se acabó la partida.`,
    ], s), namesMaterial: false };
  }

  if (f.good) {
    if (f.onlyGoodMove) {
      return { text: pick([
        `¡Solo había una jugada buena y la encontraste!`,
        `Era la única jugada que servía, y la viste.`,
      ], s), namesMaterial: false };
    }
    const m = f.playedMotifs.find((x) => x.key !== "hangs_own");
    if (m) {
      if (isHanging(m)) {
        return { text: `Muy buena: ${hangingPhrase(m)}.`, namesMaterial: true };
      }
      const target = m.piece && m.square ? ` sobre ${art(m.piece)} de ${m.square}` : "";
      return { text: pick([
        `Muy buena: montas ${motifArt(m.label)}${target}.`,
        `Excelente, encuentras ${motifArt(m.label)}${target}.`,
      ], s), namesMaterial: false };
    }
    if (f.isSacrificeConfirmed) {
      return { text: `Sacrificio correcto: entregas ${art(f.playedPiece)} y el motor confirma que hay compensación.`, namesMaterial: true };
    }
    if (f.capturedPiece) {
      return { text: pick([
        `Ganas ${art(f.capturedPiece)}.`,
        `Te llevas ${art(f.capturedPiece)}.`,
      ], s), namesMaterial: true };
    }
    return { text: `Jugada precisa: el motor la confirma como la mejor de la posición.`, namesMaterial: false };
  }

  // ── errors ──
  // Only a move the engine actually judged as an error may use the error
  // templates. Without this gate, a perfectly fine capture (classified best or
  // good) got the headline "el alfil de f3 se queda colgado" — technically the
  // piece is en prise, but that's the normal recapture that follows a trade,
  // not a mistake. Quiet/strong moves fall through to the descriptive tier.
  const isError = f.classification === "inaccuracy" || f.classification === "mistake" || f.classification === "blunder";
  if (!isError) return quietComment(f);

  if (f.missedForcedMate) {
    return { text: pick([
      `Tenías jaque mate forzado y se te escapó.`,
      `Había mate forzado a tu favor: esta jugada lo deja ir.`,
    ], s), namesMaterial: false };
  }

  if (f.selfHang) {
    const p = art(f.selfHang.piece), sq = f.selfHang.square;
    return { text: pick([
      `${cap(p)} de ${sq} queda sin defensa.`,
      `Dejas ${p} de ${sq} sin ningún defensor.`,
      `${cap(p)} de ${sq} se queda colgado.`,
    ], s), namesMaterial: true };
  }

  if (f.materialLostPiece && f.materialSettled && f.materialNet >= 2) {
    const p = art(f.materialLostPiece);
    return { text: f.materialTrades
      ? pick([
          `Tras los cambios pierdes ${p}.`,
          `La secuencia de cambios te cuesta ${p}.`,
        ], s)
      : pick([
          `Con esta jugada pierdes ${p}.`,
          `Esto entrega ${p} sin compensación.`,
        ], s), namesMaterial: true };
  }

  if (f.oppCapturesPiece) {
    return { text: pick([
      `El rival te captura ${art(f.oppCapturesPiece)}.`,
      `Le regalas ${art(f.oppCapturesPiece)} al rival.`,
    ], s), namesMaterial: true };
  }

  // Walked into a tactic: the opponent's best reply lands a named pattern.
  // This is the single biggest replacement for the "pierdes el hilo" wildcard —
  // it names exactly what the move allowed.
  if (f.allowsMotif && !isHanging(f.allowsMotif)) {
    const am = f.allowsMotif;
    const target = am.piece && am.square ? ` sobre ${art(am.piece)} de ${am.square}` : "";
    return { text: pick([
      `Permites ${motifArt(am.label)}${target}.`,
      `El rival responde con ${motifArt(am.label)}${target}.`,
    ], s), namesMaterial: false };
  }

  // Weakening the castled king's pawn cover — the most common positional
  // error in the sample (4 of 17 wildcards, one of them a blunder).
  if (f.weakensKingShield) {
    return { text: pick([
      `Adelantas un peón del escudo de tu rey y abres líneas hacia él.`,
      `Ese avance debilita la cobertura de tu rey.`,
    ], s), namesMaterial: false };
  }

  // King walking towards the middle while pieces are still on — different from
  // the endgame, where centralising the king is correct.
  if (f.kingToCenter) {
    return { text: pick([
      `Llevas el rey hacia el centro con piezas aún en juego: queda expuesto.`,
      `El rey camina al centro demasiado pronto y se vuelve un blanco.`,
    ], s), namesMaterial: false };
  }

  // A knight on the rim is dim — but only knights: a rook on the h-file is
  // normal play, which is why this is piece-specific.
  if (f.knightToRim) {
    return { text: pick([
      `El caballo en ${f.playedTo} queda en la banda, con pocas casillas útiles.`,
      `Caballo a la banda: desde ${f.playedTo} controla muy poco.`,
    ], s), namesMaterial: false };
  }

  // Retreating gives back tempo and activity.
  if (f.retreats) {
    return { text: pick([
      `Retrocedes ${art(f.playedPiece)} y pierdes actividad.`,
      `Volver atrás con ${art(f.playedPiece)} le regala un tiempo al rival.`,
    ], s), namesMaterial: false };
  }

  // Trapped piece: it still stands, but every square it can reach loses it.
  if (f.trappedPiece) {
    const tp = art(f.trappedPiece.piece);
    return { text: pick([
      `${cap(tp)} de ${f.trappedPiece.square} queda atrapado: no tiene casilla segura.`,
      `Dejas ${tp} de ${f.trappedPiece.square} sin escapatoria.`,
    ], s), namesMaterial: true };
  }

  // Back rank: king shut in behind its own pawns, the classic mating pattern.
  if (f.backRankRisk) {
    return { text: pick([
      `Tu rey queda encerrado en la última fila, sin casilla de escape.`,
      `Cuidado con la última fila: tu rey no tiene por dónde salir.`,
    ], s), namesMaterial: false };
  }

  const bm = f.bestMotifs.find((x) => x.key !== "hangs_own");
  if (bm) {
    if (isHanging(bm)) {
      return { text: `${cap(hangingPhrase(bm))}.`, namesMaterial: true, usedBestMotif: true };
    }
    const target = bm.piece && bm.square ? ` sobre ${art(bm.piece)} de ${bm.square}` : "";
    return { text: pick([
      `Tenías ${motifArt(bm.label)}${target} y la dejas pasar.`,
      `Había ${motifArt(bm.label)}${target} disponible.`,
    ], s), namesMaterial: false, usedBestMotif: true };
  }

  // Nothing concrete detected — say it qualitatively. Deliberately NO pawn
  // count: chess.com shows the number in its own badge and keeps the prose
  // qualitative ("ahora tu oponente tiene ventaja"), and "pierdes 1.8 peones"
  // is engine jargon — a club player thinks "quedé peor", not in centipawns.
  // Our UI already shows the eval separately in the bar, so the number here was
  // both off-register and redundant. Slot B supplies the "how it changed" half.
  if (Math.abs(f.evalBefore) < MATE_MAG && Math.abs(f.evalAfter) < MATE_MAG) {
    if (f.classification === "inaccuracy") {
      return { text: pick([`Imprecisión: cedes algo de terreno.`, `No es grave, pero hay algo mejor aquí.`], s), namesMaterial: false };
    }
    if (f.classification === "blunder") {
      return { text: pick([`Error grave: la posición se te complica de golpe.`, `Esta jugada le entrega la partida al rival.`], s), namesMaterial: false };
    }
    if (f.classification === "mistake") {
      return { text: pick([`Error: le das la iniciativa al rival.`, `Con esta jugada pierdes el hilo de la posición.`], s), namesMaterial: false };
    }
  }
  return null;
}

// ── Slot B — how the game changed ────────────────────────────────────────────
// Skipped when slot A already named a concrete material loss: "pierdes la dama"
// followed by "ahora el rival manda" states the obvious.
function slotB(f: MoveFacts, aNamesMaterial: boolean): string | null {
  if (aNamesMaterial) return null;
  if (Math.abs(f.evalBefore) >= MATE_MAG || Math.abs(f.evalAfter) >= MATE_MAG) return null;
  const b = band(f.evalBefore), a = band(f.evalAfter);
  const wasGood = b === "mejor" || b === "ganando";
  const wasBad = b === "peor" || b === "perdida";
  const nowGood = a === "mejor" || a === "ganando";
  const nowBad = a === "peor" || a === "perdida";
  const s = f.variantSeed;

  // Positive transitions. These were missing entirely, so a comeback — the
  // most encouraging thing that can happen in a game — went unmentioned.
  if (wasBad && nowGood) return pick(["Le das la vuelta a la partida: de estar peor pasas a mandar.", "Gran cambio de rumbo: venías peor y ahora tienes ventaja."], s);
  if (wasBad && a === "igualada") return pick(["Recuperas: la partida vuelve a estar pareja.", "Enderezas la posición y queda igualada."], s);
  if (b === "igualada" && nowGood) return pick(["Tomas la iniciativa desde una posición pareja.", "De estar igualado pasas a llevar la ventaja."], s);
  if (b === "perdida" && a === "peor") return pick(["Sigues peor, pero la posición ya no está perdida.", "Reduces el daño: la partida deja de estar perdida."], s);

  if (f.good) return null; // the rest describe losing ground

  if (b === "igualada" && nowBad) return pick(["Estaba parejo y ahora el rival toma la ventaja.", "De una posición igualada pasas a estar peor."], s);
  if (wasGood && a === "igualada") return pick(["Tenías ventaja y la dejas escapar: queda igualada.", "Se te va la ventaja y la partida se iguala."], s);
  if (wasGood && nowBad) return pick(["Ibas con ventaja y ahora estás peor.", "Pasas de mandar en la partida a estar en desventaja."], s);
  if (b === "perdida" && a === "perdida") return pick(["Ya venías mal, así que esto no la decide, pero tampoco ayuda.", "La posición ya era difícil de antes."], s);
  if (b === "ganando" && a === "ganando") return pick(["Sigues ganando, pero desperdicias parte de la ventaja.", "Aún ganas, aunque cediste terreno."], s);
  return null;
}

// ── Slot C — what was better ─────────────────────────────────────────────────
// Never shown on a good move (you don't tell someone who found the best move
// that something else was better) or on a mate.
function slotC(f: MoveFacts, usedBestMotif: boolean): string | null {
  if (f.good || f.isMate || !f.bestPiece || !f.bestTo) return null;
  const s = f.variantSeed;
  const bp = art(f.bestPiece), sq = f.bestTo;

  // When the headline is a missed mate, the alternative has to be about the
  // mate — "te llevabas el peón" badly undersells it.
  if (f.missedForcedMate) return `Con ${bp} a ${sq} forzabas el mate.`;
  if (f.bestDefendsHung && f.selfHang) return `Con ${bp} a ${sq} lo defendías.`;
  if (f.bestCapturedPiece) return pick([
    `Con ${bp} a ${sq} te llevabas ${art(f.bestCapturedPiece)}.`,
    `${cap(bp)} a ${sq} capturaba ${art(f.bestCapturedPiece)}.`,
  ], s);
  // Skipped when slot A already named this same motif, so the two halves don't
  // repeat each other ("Había un pincho. Con el alfil montabas un pincho.").
  const bm = usedBestMotif ? undefined : f.bestMotifs.find((x) => x.key !== "hangs_own" && !isHanging(x));
  if (bm) return `Con ${bp} a ${sq} montabas ${motifArt(bm.label)}.`;
  if (f.bestGivesCheck) return `${cap(bp)} a ${sq} daba jaque y cambiaba el ritmo.`;
  if (f.bestIsCastle) return `Enrocar primero dejaba al rey a salvo.`;
  if (f.bestIsCenterPawn) return `Atacar el centro con el peón a ${sq} era mejor.`;
  return pick([`${cap(bp)} a ${sq} era mejor.`, `Lo indicado era ${bp} a ${sq}.`], s);
}

// Composes the final comment: A always, then B or C — whichever adds more —
// never all three, so the text stays short.
export function composeCoachComment(f: MoveFacts): string | null {
  const a = slotA(f);
  if (!a) return null;
  if (f.isMate && f.evalAfter > 0) return a.text;

  const b = slotB(f, a.namesMaterial);
  const c = slotC(f, a.usedBestMotif ?? false);
  // C (a concrete alternative) teaches more than B (context), so it wins when
  // both are available.
  const second = c ?? b;
  return second ? `${a.text} ${second}` : a.text;
}
