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
  // The LAST book move, plus the opening's Spanish name. chess.com marks this
  // moment ("this is the last book move") and it's genuinely the most useful
  // thing to say in an opening: it's where the player stops being carried by
  // theory and starts making their own decisions.
  isLastBookMove?: boolean;
  openingName?: string | null;
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
  // Second diagnosis round, from a 42-move game where these exact moves fell
  // through to "Jugada sólida" / "pierdes el hilo".
  allowsEnPassant?: boolean;   // two-square advance the opponent can take en passant
  movesPieceTwice?: boolean;   // same piece moved again in the opening
  queenOutEarly?: boolean;     // queen leaves home before development is done
  pawnBreak?: boolean;         // pawn advance that hits an enemy pawn
  attacksBigger?: string | null; // Spanish name of the bigger enemy piece now attacked
  knightToCenter?: boolean;    // knight lands on d4/e4/d5/e5
  rookToSemiOpen?: boolean;    // rook to a file with no pawns of your own
  supportsPawnChain?: boolean; // the pawn now defends another of your pawns
  outpost?: boolean;           // minor on a square no enemy pawn can challenge

  // ── From the attack table, the pawn-structure reader and the eval terms ────
  // The three tools that let the coach say WHY a position got worse instead of
  // only that it did.
  overloaded?: { piece: string; count: number } | null; // your sole defender has two jobs
  underDefended?: { piece: string; square: string } | null; // attacked more times than defended
  structure?: {
    gaveSelfDoubled: string | null;
    gaveSelfIsolated: string | null;
    createdPassed: string | null;
    brokeTheirStructure: string | null;
    isolatedTheirs: string | null;
  } | null;
  dominantTerm?: { term: string; delta: number } | null;  // which part of the eval moved
  theirKingWorse?: boolean;    // your move added real pressure to their king
  // From the null move: what the opponent is about to do, and what you're
  // threatening. The only genuinely PREDICTIVE facts in the set — everything
  // else describes the move that was already played.
  ignoredThreat?: { kind: string; piece: string; square: string } | null;
  ownThreat?: { kind: string; piece: string; square: string } | null;

  // Endgame vocabulary. The rules invert here — a king walking to the centre is
  // an error with pieces on and the whole point of a pawn ending — so these
  // only ever fire once the board has emptied out.
  // From the quiescence search: pawns the player gains (+) or loses (−) once
  // every capture and check has played out. This is the answer SEE can't give —
  // SEE settles ONE square, this follows the tactics wherever they go.
  dustMaterial?: number;
  isEndgame?: boolean;
  kingActivates?: boolean;
  opposition?: boolean;
  rookBehindPassed?: boolean;
  pawnRunsToPromote?: boolean;
  connectsRooks?: boolean;
  // Rule of the square: an exact, provable verdict on whether the passed pawn
  // gets through. Only set in genuine king-and-pawn endings.
  squareRule?: { pawnSquare: string; promotes: boolean; margin: number } | null;
  // The piece the player has forgotten about — badly placed for its type and
  // with nowhere to go.
  passivePiece?: { piece: string; square: string; stillHome: boolean; reason: string } | null;

  // ── The player's point of view ─────────────────────────────────────────────
  // Every comment used to be advice to WHOEVER moved, which is why the same
  // templates worked for the opponent unchanged and the viewer just labelled them
  // "Tu oponente". But an opponent's mistake isn't information about them, it's an
  // OPPORTUNITY for the player — and the search that finds it is already being
  // done: the punishment line for their error starts with the player's best move.
  byOpponent?: boolean;
  // What the player can do about the opponent's mistake, read off that line.
  opportunity?: { piece: string; to: string; captures: string | null; isMate: boolean } | null;
  // Set on the PLAYER's move, about the opportunity the PREVIOUS ply created:
  // true if this move took it, false if it was there and went unplayed. Null when
  // there was no opportunity to speak of — so "missed" is never implied by silence.
  tookOpportunity?: boolean | null;
  missedOpportunity?: { piece: string; to: string; captures: string | null } | null;

  // Read from the engine's MAIN LINE rather than the position in front of us.
  // Naming the best move says what to play; naming its follow-up says why, and
  // "why" is the whole difference between a move list and coaching.
  bestFollowUp?: string | null;    // ready-made clause, e.g. "y después te llevas la torre de d5"
  bestLineForced?: boolean;        // the whole line is captures and checks
  bestLineWins?: { piece: string; square: string } | null;
  punishFollowUp?: string | null;  // what the opponent does after their first reply
  punishFocusSquare?: string | null; // square the exchange sequence settles on
}

const ART: Record<string, string> = {
  "peón": "el peón", caballo: "el caballo", alfil: "el alfil",
  torre: "la torre", dama: "la dama", rey: "el rey",
};
const art = (p: string | null | undefined) => (p ? ART[p] ?? `el ${p}` : "la pieza");
// Spanish contracts "de + el" into "del". Interpolating art() after a bare "de"
// produced "los defensores de el peón" — the exact class of slot-seam grammar
// bug that gives template text away.
const deArt = (p: string | null | undefined) => {
  const a = art(p);
  return a.startsWith("el ") ? `del ${a.slice(3)}` : `de ${a}`;
};
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
  // `standing` reads after a verb ("quedas …"). Some templates lead with "La
  // posición", and interpolating `standing` there produced "La posición sigue en
  // una posición equilibrada" — the same doubled-noun seam we already fixed once
  // for the trade templates and I reintroduced with a new variant. `state` is the
  // adjectival form for those.
  const state =
    where === "ganando" ? "decidida a tu favor" : where === "mejor" ? "a tu favor" :
    where === "igualada" ? "equilibrada" : where === "peor" ? "en tu contra" :
    "muy difícil";
  // "Sigues con ventaja" contradicts slot B whenever slot B is reporting that the
  // position just CHANGED — you can't continue with an advantage you just gained.
  // Found by sweeping all four fallback variants across all five bands, which is
  // the only way this kind of seam between two independent slots shows up.
  const shifted = band(f.evalBefore) !== where;
  const stays = shifted ? "quedas" : "sigues";

  if (f.isBook) {
    // Said once per game, on the move where theory runs out — not on all
    // fourteen book moves, which would be noise.
    if (f.isLastBookMove) {
      const named = f.openingName ? ` Vienes de la ${f.openingName}.` : "";
      return { text: pick([
        `Última jugada de teoría.${named} A partir de aquí decides tú.`,
        `Aquí se acaba el libro.${named} Lo que siga ya es tu propio plan.`,
      ], s), namesMaterial: false };
    }
    if (f.isCastle) return { text: `Jugada de libro: enrocas y pones el rey a salvo.`, namesMaterial: false };
    if (f.developsPiece) return { text: pick([
      `Jugada de libro: sacas ${art(f.playedPiece)} a ${f.playedTo}, desarrollo normal de la apertura.`,
      `Teoría: ${art(f.playedPiece)} va a ${f.playedTo} para entrar en juego.`,
      `Desarrollo de libro. ${cap(art(f.playedPiece))} a ${f.playedTo} es la jugada principal aquí.`,
      `Sigues la teoría: ${art(f.playedPiece)} a ${f.playedTo}.`,
    ], s), namesMaterial: false };
    if (f.toCenter) return { text: pick([
      `Jugada de libro: disputas el centro con ${art(f.playedPiece)} en ${f.playedTo}.`,
      `Teoría. ${cap(art(f.playedPiece))} a ${f.playedTo} reclama su parte del centro.`,
      `De libro: plantas ${art(f.playedPiece)} en ${f.playedTo}, en plena disputa del centro.`,
    ], s), namesMaterial: false };
    return { text: pick([
      `Jugada de libro: ${art(f.playedPiece)} a ${f.playedTo} sigue la teoría.`,
      `Teoría de la apertura, ${art(f.playedPiece)} a ${f.playedTo}.`,
    ], s), namesMaterial: false };
  }

  if (f.isPromotion) return { text: `Coronas en ${f.playedTo} y quedas ${standing}.`, namesMaterial: true };
  if (f.isCastle) return { text: pick([`Enrocas y pones el rey a salvo.`, `Enrocas: el rey queda protegido y la torre entra en juego.`], s), namesMaterial: false };
  if (f.capturedPiece) {
    const cp = art(f.capturedPiece);
    // A recapture is a different event from a capture: nothing new is won, the
    // balance is restored. Saying "el caballo cae gratis" about a recapture is
    // simply false — that piece was paid for on the previous move.
    //
    // No longer gated on the trade verdict. SEE looks at the square AFTER the
    // recapture and often reports "gana", because by then nothing can take back;
    // that made a routine retake read as winning a free piece (seen on cxd4
    // completing an even knight trade). Being a recapture outranks what SEE says
    // about the square.
    if (f.isRecapture) return { text: pick([
      `Recuperas la pieza en ${f.playedTo}: el cambio queda saldado.`,
      `Retomas en ${f.playedTo} y el material vuelve a estar igual.`,
    ], s), namesMaterial: true };
    if (f.tradeVerdict === "gana") return { text: pick([
      `Capturas ${cp} en ${f.playedTo} y ganas material.`,
      // No clitic pronoun here: "…recuperarlo" disagreed with feminine pieces
      // ("la dama … recuperarlo").
      `Te llevas ${cp} de ${f.playedTo} sin compensación para el rival.`,
      `${cap(cp)} de ${f.playedTo} cae gratis: el rival no lo recupera.`,
      `Ganas material en ${f.playedTo}: la captura sale a tu favor.`,
    ], s), namesMaterial: true };
    if (f.tradeVerdict === "pareja") return { text: pick([
      `Cambias ${cp} en ${f.playedTo}: un cambio parejo.`,
      // `standing` can itself be "en una posición equilibrada", which read as
      // "Cambio equilibrado … posición equilibrada".
      `Cambio parejo en ${f.playedTo}.`,
      `Te llevas ${cp} y el rival recupera: quedan iguales.`,
      `Cambio de piezas en ${f.playedTo}, sin ventaja para ninguno.`,
    ], s), namesMaterial: true };
    return { text: pick([
      `Capturas ${cp} en ${f.playedTo}.`,
      `Te llevas ${cp} y quedas ${standing}.`,
    ], s), namesMaterial: true };
  }
  if (f.gaveCheck) return { text: `Das jaque con ${art(f.playedPiece)} y quedas ${standing}.`, namesMaterial: false };

  // The positive side of the same reading: the tactics on the board are going
  // to win material even though this move didn't capture anything.
  if ((f.dustMaterial ?? 0) >= 3) return { text: pick([
    `Los cambios que vienen te dejan material de más.`,
    `Cuando se resuelvan las capturas, sales ganando material.`,
  ], s), namesMaterial: true };

  // A threat the opponent must answer outranks any description of the move: it
  // was landing below "Desarrollas el alfil a d3" and so never appeared once in
  // six games, even though it's the most useful thing the coach can say about a
  // quiet move.
  if (f.ownThreat) {
    const ot = f.ownThreat;
    if (ot.kind === "mate") return { text: `Amenazas mate en ${ot.square}: el rival está obligado a defenderse.`, namesMaterial: false };
    return { text: pick([
      `Ahora amenazas ${art(ot.piece)} de ${ot.square}.`,
      `La jugada arma una amenaza: ${art(ot.piece)} de ${ot.square} está en el aire.`,
      `Con esto pones ${art(ot.piece)} de ${ot.square} en el punto de mira.`,
    ], s), namesMaterial: false };
  }

  // ── Endgame ────────────────────────────────────────────────────────────────
  // The square rule outranks every other endgame remark because it's the only
  // one with a provable answer: the pawn either gets through or it doesn't.
  if (f.squareRule) {
    const sr = f.squareRule;
    if (sr.promotes) return { text: pick([
      `El rey rival ya no entra en el cuadrado: el peón de ${sr.pawnSquare} corona solo.`,
      `Cuenta el cuadrado: el peón de ${sr.pawnSquare} llega antes que el rey rival.`,
    ], s), namesMaterial: false };
    return { text: pick([
      `El rey rival está dentro del cuadrado y detiene el peón de ${sr.pawnSquare}: hace falta acercar tu rey.`,
      `Así el peón de ${sr.pawnSquare} no corona solo; el rey rival llega. Tienes que apoyarlo con el tuyo.`,
    ], s), namesMaterial: false };
  }
  if (f.pawnRunsToPromote) return { text: pick([
    `El peón pasado avanza a ${f.playedTo}: cada casilla lo acerca a coronar.`,
    `Empujas el peón pasado hasta ${f.playedTo}. El rival tendrá que gastar una pieza en frenarlo.`,
  ], s), namesMaterial: false };
  if (f.opposition) return { text: `Tomas la oposición: el rey rival tiene que ceder terreno.`, namesMaterial: false };
  if (f.kingActivates) return { text: pick([
    `En el final el rey es una pieza más, y lo llevas al centro.`,
    `Activas el rey hacia ${f.playedTo}: en el final es donde más pesa.`,
  ], s), namesMaterial: false };
  if (f.rookBehindPassed) return { text: `Torre detrás del peón pasado, que es su sitio: lo empuja según avanza.`, namesMaterial: false };
  if (f.connectsRooks) return { text: `Conectas las torres: ya se defienden entre ellas.`, namesMaterial: false };
  // Attacking something bigger than what you moved wins a tempo — the opponent
  // has to answer. Ranked high because it's the concrete point of the move.
  if (f.attacksBigger) return { text: pick([
    `${cap(art(f.playedPiece))} a ${f.playedTo} ataca ${art(f.attacksBigger)}: el rival tiene que responder.`,
    `Ganas un tiempo: desde ${f.playedTo} amenazas ${art(f.attacksBigger)}.`,
  ], s), namesMaterial: false };
  // A pawn break is how you open the position — nameable, and it was landing
  // on "Jugada sólida" before.
  if (f.pawnBreak) return { text: pick([
    `Ruptura de peones: el peón de ${f.playedTo} golpea la cadena rival.`,
    `Atacas la estructura del rival con el peón a ${f.playedTo}.`,
  ], s), namesMaterial: false };
  // An outpost is the best square a minor can get, and naming it teaches the
  // idea: it's not just "a good square", it's one no pawn can ever kick.
  if (f.outpost) return { text: pick([
    `${cap(art(f.playedPiece))} se instala en ${f.playedTo}: apoyado por tu peón y sin peones rivales que lo echen.`,
    `Puesto avanzado en ${f.playedTo}. Ningún peón rival puede desalojar ${art(f.playedPiece)} de ahí.`,
  ], s), namesMaterial: false };
  if (f.knightToCenter) return { text: pick([
    `Centralizas el caballo en ${f.playedTo}, desde donde controla más casillas.`,
    `El caballo en ${f.playedTo} está en su mejor sitio: el centro.`,
  ], s), namesMaterial: false };
  // King sidestep that opens an escape square — a real, nameable idea that was
  // landing on "Jugada sólida" before.
  if (f.givesKingLuft) return { text: pick([
    `Le das aire a tu rey: ahora tiene casilla de escape.`,
    `Mueves el rey a ${f.playedTo} y evitas sustos en la última fila.`,
  ], s), namesMaterial: false };
  if (f.retreats) return { text: pick([
    `Repliegas ${art(f.playedPiece)} a ${f.playedTo} para reagrupar.`,
    `Retiras ${art(f.playedPiece)} a ${f.playedTo}.`,
    `${cap(art(f.playedPiece))} vuelve a ${f.playedTo} y espera mejor momento.`,
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
  if (f.rookToSemiOpen) return { text: pick([
    `La torre toma la columna ${f.playedTo[0]}, semiabierta: presiona el peón rival.`,
    `Torre a la columna ${f.playedTo[0]}, donde no tienes peones que te estorben.`,
  ], s), namesMaterial: false };
  if (f.fianchetto) return { text: `Fianchetto: el alfil a ${f.playedTo} apunta a la diagonal larga.`, namesMaterial: false };
  if (f.queenOutEarly) return { text: `Sacas la dama pronto: cuidado, el rival puede ganar tiempos atacándola.`, namesMaterial: false };
  if (f.movesPieceTwice) return { text: pick([
    `Vuelves a mover ${art(f.playedPiece)} en vez de sacar una pieza nueva.`,
    `${cap(art(f.playedPiece))} se mueve otra vez; quedan piezas por desarrollar.`,
  ], s), namesMaterial: false };
  // Four variants, not two: measured over six games, "Sacas … y ganas actividad"
  // and "Desarrollas …" were the two most repeated sentences in the whole engine
  // (19 and 15 uses). "Y ganas actividad" is also filler by our own rule — it
  // asserts something we haven't measured — so it's gone.
  if (f.developsPiece) return { text: pick([
    `Desarrollas ${art(f.playedPiece)} a ${f.playedTo}.`,
    `${cap(art(f.playedPiece))} entra en juego desde ${f.playedTo}.`,
    `Pones ${art(f.playedPiece)} en ${f.playedTo}, fuera de su casilla inicial.`,
    `Sumas ${art(f.playedPiece)} al juego: sale a ${f.playedTo}.`,
  ], s), namesMaterial: false };
  if (f.toCenter) return { text: `Ocupas el centro con ${art(f.playedPiece)} en ${f.playedTo}.`, namesMaterial: false };
  // Structural gains — a passed pawn or a wrecked enemy structure outlives any
  // tactic on the board and is worth naming even on an ordinary move.
  if (f.structure?.createdPassed) return { text: pick([
    `Creas un peón pasado en ${f.structure.createdPassed}: nada lo frena camino a coronar.`,
    `El peón de ${f.structure.createdPassed} queda pasado, y eso pesa en el final.`,
  ], s), namesMaterial: false };
  if (f.structure?.brokeTheirStructure) return { text: `Le dejas peones doblados en la columna ${f.structure.brokeTheirStructure}: un defecto permanente.`, namesMaterial: false };
  if (f.structure?.isolatedTheirs) return { text: `Aíslas el peón rival de ${f.structure.isolatedTheirs}: ya no tiene quién lo defienda.`, namesMaterial: false };
  if (f.theirKingWorse) return { text: pick([
    `Sumas presión sobre el rey rival: ${art(f.playedPiece)} apunta a su posición.`,
    `${cap(art(f.playedPiece))} en ${f.playedTo} aprieta el cerco al rey rival.`,
  ], s), namesMaterial: false };
  if (f.supportsPawnChain) return { text: pick([
    `Refuerzas la cadena: el peón de ${f.playedTo} sostiene a su compañero.`,
    `El peón a ${f.playedTo} apuntala tu estructura y le quita casillas al rival.`,
    `Cadena de peones: ${f.playedTo} respalda al peón de delante.`,
  ], s), namesMaterial: false };
  // Last stop before the wildcard: name whichever part of the position the move
  // actually improved. "Jugada sólida" says nothing; "ganas movilidad" is true,
  // measured, and teaches the player what the move was for.
  const dq = f.dominantTerm;
  if (dq && dq.delta > 0) {
    if (dq.term === "mobility") return { text: pick([
      `Ganas movilidad: tus piezas cubren más casillas desde aquí.`,
      `${cap(art(f.playedPiece))} a ${f.playedTo} le da aire a tus piezas.`,
    ], s), namesMaterial: false };
    if (dq.term === "space") return { text: pick([
      `Ganas espacio en el campo rival.`,
      `Avanzas tu frente y le quitas terreno al rival.`,
    ], s), namesMaterial: false };
    if (dq.term === "development") return { text: `Sumas una pieza al juego: vas por delante en desarrollo.`, namesMaterial: false };
  }
  // Last resort before the wildcard: the piece the player has forgotten. It
  // isn't about the move that was played, which is exactly why it belongs here —
  // when there's nothing to say about the move, there's still something worth
  // saying about the position.
  if (f.passivePiece) {
    const pp = f.passivePiece;
    // This observation is about a DIFFERENT piece than the one that moved, so it
    // has to announce itself as an aside. Without the lead-in it read as a
    // non-sequitur: you move a knight and the coach talks about your bishop.
    // Naming the move first is what makes the remark land instead of confuse.
    const aside = `${cap(art(f.playedPiece))} a ${f.playedTo}.`;
    if (pp.stillHome) return { text: pick([
      `${aside} Ojo aparte: ${art(pp.piece)} de ${pp.square} sigue sin entrar en juego.`,
      `${aside} Te falta desarrollar ${art(pp.piece)} de ${pp.square}: ahí no hace nada.`,
    ], s), namesMaterial: false };
    if (pp.reason === "entombed") {
      return { text: pick([
        `${aside} Mientras tanto, ${art(pp.piece)} de ${pp.square} está encerrado por tus propias piezas.`,
        `${aside} Ojo aparte: ${art(pp.piece)} de ${pp.square} casi no tiene casillas.`,
      ], s), namesMaterial: false };
    }
    return { text: pick([
      `${aside} Aparte, ${art(pp.piece)} de ${pp.square} está en mal sitio: desde la banda controla muy poco.`,
      `${aside} Mientras tanto, ${art(pp.piece)} de ${pp.square} pinta poco ahí; su lugar está más al centro.`,
    ], s), namesMaterial: false };
  }
  // Phase modifier: in an endgame the same standing means something different to
  // the player, and naming the phase costs nothing since we already know it.
  if (f.isEndgame) return { text: pick([
    `${cap(art(f.playedPiece))} a ${f.playedTo}. En el final ${stays} ${standing}.`,
    `Jugada de final tranquila: quedas ${standing}.`,
  ], s), namesMaterial: false };
  return { text: pick([
    `${cap(art(f.playedPiece))} a ${f.playedTo}: ${stays} ${standing}.`,
    `Jugada sólida, quedas ${standing}.`,
    `Jugada tranquila. La posición ${shifted ? "queda" : "sigue"} ${state}.`,
    `${cap(art(f.playedPiece))} a ${f.playedTo}: la posición ${shifted ? "queda" : "sigue"} ${state}.`,
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

  // The punishment as a SEQUENCE. "El rival te captura el caballo" says what
  // happens; adding where the exchange settles, or what comes after their first
  // move, is the two-or-three-moves-ahead view — and it's read off a line the
  // engine actually returned, not guessed.
  if (f.oppCapturesPiece && (f.punishFollowUp || f.punishFocusSquare)) {
    const opener = `El rival te captura ${art(f.oppCapturesPiece)}`;
    if (f.punishFollowUp) return { text: `${opener} ${f.punishFollowUp}.`, namesMaterial: true };
    return { text: `${opener}, y la lucha en ${f.punishFocusSquare} acaba a su favor.`, namesMaterial: true };
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

  // En passant is the rule club players forget, so the move looks safe and
  // isn't. Worth ranking above the other positional signals: it costs a pawn.
  if (f.allowsEnPassant) {
    return { text: pick([
      `Ese avance de dos casillas se puede capturar al paso, y pierdes el peón.`,
      `Cuidado con la captura al paso: el peón de ${f.playedTo} cae igual.`,
    ], s), namesMaterial: true };
  }

  // What the tactics are worth once they finish. Ranked above the positional
  // signals because material outranks everything, and above `ignoredThreat`
  // because it counts the WHOLE sequence rather than the opponent's best single
  // capture — this is the "two or three moves ahead" case: you take, they take,
  // you take again, and only then does the balance show.
  const dust = f.dustMaterial ?? 0;
  if (dust <= -3) {
    return { text: pick([
      `Cuando terminen los cambios te quedas con material de menos.`,
      `La secuencia de capturas no te favorece: acabas perdiendo material.`,
    ], s), namesMaterial: true };
  }

  // Ignoring a threat that was already on the board — the single most common way
  // a club game is lost, and until now nothing in the set could see it, because
  // every other detector asks what the move DID rather than what it left alone.
  if (f.ignoredThreat) {
    const it = f.ignoredThreat;
    if (it.kind === "mate") {
      return { text: `Te estaban amenazando mate en ${it.square} y la jugada no lo evita.`, namesMaterial: false };
    }
    return { text: pick([
      `Dejas pasar la amenaza: el rival se lleva ${art(it.piece)} de ${it.square}.`,
      `La amenaza sobre ${it.square} seguía ahí, y ahora ${art(it.piece)} cae.`,
    ], s), namesMaterial: true };
  }

  // Attacked more times than it's defended. Distinct from "hanging": the piece
  // HAS a defender, it just doesn't have enough of them, which is why it looks
  // safe to a club player and isn't.
  if (f.underDefended) {
    const ud = f.underDefended;
    return { text: pick([
      `${cap(art(ud.piece))} de ${ud.square} recibe más ataques que defensas.`,
      `No alcanzan los defensores ${deArt(ud.piece)} en ${ud.square}.`,
    ], s), namesMaterial: true };
  }

  // An overloaded defender is the classic invisible loss: every piece looks
  // defended, but one defender is doing two jobs and can only do one.
  if (f.overloaded) {
    return { text: pick([
      `${cap(art(f.overloaded.piece))} está sobrecargado: defiende dos cosas a la vez y no puede con ambas.`,
      `Le pides demasiado a ${art(f.overloaded.piece)}: es el único defensor de dos piezas.`,
    ], s), namesMaterial: false };
  }

  // Structural damage you did to yourself — permanent, unlike a lost tempo.
  if (f.structure?.gaveSelfDoubled) {
    return { text: pick([
      `Te quedan peones doblados en la columna ${f.structure.gaveSelfDoubled}: se defienden mal y no avanzan.`,
      `Doblas tus peones en la columna ${f.structure.gaveSelfDoubled}, un defecto que ya no se arregla.`,
    ], s), namesMaterial: false };
  }
  if (f.structure?.gaveSelfIsolated) {
    return { text: `El peón de ${f.structure.gaveSelfIsolated} queda aislado: ningún peón tuyo puede defenderlo.`, namesMaterial: false };
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

  // Two opening-principle errors. Both only fire inside the opening, where the
  // principle actually holds — moving a piece twice is normal in the middlegame.
  if (f.queenOutEarly) {
    return { text: pick([
      `Sacas la dama antes de terminar el desarrollo: el rival gana tiempos atacándola.`,
      `La dama sale muy pronto y se convierte en blanco de las piezas menores.`,
    ], s), namesMaterial: false };
  }

  if (f.movesPieceTwice) {
    return { text: pick([
      `Mueves ${art(f.playedPiece)} por segunda vez con piezas sin desarrollar.`,
      `Otra vez ${art(f.playedPiece)}: pierdes un tiempo que hacía falta para desarrollar.`,
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
  // Before falling back to a wildcard: the eval is a SUM of terms, and the term
  // that moved most IS the reason. This is what "pierdes el hilo de la posición"
  // was standing in for — now we can name it.
  const dt = f.dominantTerm;
  if (dt && dt.delta < 0 && dt.term !== "material") {
    const phrase =
      dt.term === "mobility" ? [
        `Tus piezas se quedan sin casillas: pierdes movilidad.`,
        `Después de esta jugada tus piezas tienen mucho menos por dónde moverse.`,
      ] : dt.term === "space" ? [
        `Cedes espacio: el rival manda ahora en tu mitad del tablero.`,
        `Le entregas terreno al rival.`,
      ] : dt.term === "kingSafety" ? [
        `Tu rey queda más expuesto tras esta jugada.`,
        `La jugada deja al rey con menos cobertura.`,
      ] : [
        `Te retrasas en el desarrollo y el rival toma la delantera.`,
        `Pierdes tiempo de desarrollo.`,
      ];
    return { text: pick(phrase, s), namesMaterial: false };
  }

  if (Math.abs(f.evalBefore) < MATE_MAG && Math.abs(f.evalAfter) < MATE_MAG) {
    if (f.classification === "inaccuracy") {
      return { text: pick([
        `Imprecisión: cedes algo de terreno.`,
        `No es grave, pero hay algo mejor aquí.`,
        `Se puede jugar mejor, aunque no es un error de bulto.`,
        `Pequeña imprecisión; la posición aguanta.`,
      ], s), namesMaterial: false };
    }
    if (f.classification === "blunder") {
      return { text: pick([
        `Error grave: la posición se te complica de golpe.`,
        `Esta jugada le entrega la partida al rival.`,
        `Esto cambia la partida, y no a tu favor.`,
        `Error de bulto: a partir de aquí el rival lleva la iniciativa.`,
      ], s), namesMaterial: false };
    }
    if (f.classification === "mistake") {
      return { text: pick([
        `Error: le das la iniciativa al rival.`,
        `Con esta jugada pierdes el hilo de la posición.`,
        `Aquí se te escapa el control de la partida.`,
        `Jugada equivocada: el rival pasa a mandar.`,
      ], s), namesMaterial: false };
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
  // These two stay inside the same band, so unlike the transitions above they
  // need the evaluation to have ACTUALLY worsened before claiming ground was
  // lost. Without the check, a move that nudged the eval UP within "ganando"
  // still read "desperdicias parte de la ventaja" — a flat contradiction of the
  // number, and one that only surfaces when you sweep the bands rather than
  // reading a single game.
  const worsened = f.evalAfter < f.evalBefore - 0.05;
  if (b === "perdida" && a === "perdida") return pick(["Ya venías mal, así que esto no la decide, pero tampoco ayuda.", "La posición ya era difícil de antes."], s);
  if (b === "ganando" && a === "ganando" && worsened) return pick(["Sigues ganando, pero desperdicias parte de la ventaja.", "Aún ganas, aunque cediste terreno."], s);
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

  // Naming the FOLLOW-UP is what turns a move into an idea. "La dama a c7" is a
  // move; "la dama a c7, y después te llevas el caballo de d5" is the reason it
  // was the move. This sits above the generic endings on purpose — those were
  // where perfectly explainable positions used to land.
  if (f.bestFollowUp) {
    // Comma, never a colon: the clause always begins with "y…", and "a a6: y
    // después" is simply wrong in Spanish. The first draft used a colon on the
    // material-winning branch and it read like a seam.
    return pick([
      `Lo indicado era ${bp} a ${sq}, ${f.bestFollowUp}.`,
      `${cap(bp)} a ${sq} era mejor, ${f.bestFollowUp}.`,
      `Mejor ${bp} a ${sq}, ${f.bestFollowUp}.`,
    ], s);
  }
  if (f.bestLineForced && f.bestLineWins) {
    return `${cap(bp)} a ${sq} abría una secuencia forzada que gana ${art(f.bestLineWins.piece)}.`;
  }
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
/**
 * What the player can do about the opponent's mistake.
 *
 * This replaces slot C on an opponent's move. Slot C would say "lo indicado era
 * X" — advice to the RIVAL, which the player can do nothing with. The same
 * engine line, read from the other side, says what to play instead.
 */
function opportunityClause(f: MoveFacts): string | null {
  const o = f.opportunity;
  if (!o) return null;
  const s = f.variantSeed;
  if (o.isMate) return `Tienes mate con ${art(o.piece)} en ${o.to}.`;
  if (o.captures) {
    // When the capturing and captured pieces share a name ("el peón … el peón"),
    // naming both reads like a stutter. The square is what the player needs.
    const same = o.captures === o.piece;
    return pick([
      same
        ? `Puedes capturar en ${o.to} con ${art(o.piece)}.`
        : `Puedes llevarte ${art(o.captures)} con ${art(o.piece)} a ${o.to}.`,
      same
        ? `Ahí tienes ${art(o.captures)} de ${o.to}.`
        : `Ahí tienes ${art(o.captures)}: ${art(o.piece)} a ${o.to}.`,
    ], s);
  }
  return pick([
    `Tu oportunidad: ${art(o.piece)} a ${o.to}.`,
    `Aprovéchalo con ${art(o.piece)} a ${o.to}.`,
  ], s);
}

/**
 * Whether the player took the opportunity the previous move handed them.
 *
 * The praise half matters as much as the criticism: an app that only ever points
 * out mistakes reads like an audit. And a missed opportunity is a category the
 * coach simply couldn't express before — it isn't a bad move, it's a good move
 * that was available and wasn't played.
 */
function opportunityOutcome(f: MoveFacts): string | null {
  const s = f.variantSeed;
  if (f.tookOpportunity === true) {
    return pick([
      `Lo viste y lo aprovechaste.`,
      `Bien: era exactamente la jugada.`,
      `Aprovechada. Esa era.`,
    ], s);
  }
  const m = f.missedOpportunity;
  if (f.tookOpportunity === false && m) {
    const what = m.captures
      ? `llevarte ${art(m.captures)} con ${art(m.piece)} a ${m.to}`
      : `jugar ${art(m.piece)} a ${m.to}`;
    return pick([
      `Se te escapó: podías ${what}.`,
      `Ahí estaba la oportunidad: ${what}.`,
    ], s);
  }
  return null;
}

/**
 * Short, THIRD-PERSON statement of an opponent mistake.
 *
 * Slot A is written as advice to whoever moved — "dejas el alfil sin defensor",
 * "pierdes un tiempo". On the opponent's ply that inverts the roles: it reads as
 * if the PLAYER left the bishop hanging. Labelling it ("Tu oponente: …") made it
 * a quoted voice and was at least honest; reframing to the player's side and
 * keeping the inner second person ("El rival falla: Dejas el alfil…") is worse
 * than either.
 *
 * So an opponent error doesn't reuse slot A at all. It doesn't need to: the
 * opportunity clause that follows already names the piece and square, which is
 * the same fact from the side the player can act on.
 */
function opponentSlip(f: MoveFacts): string {
  const s = f.variantSeed;
  if (f.classification === "blunder") {
    return pick(["El rival comete un error grave.", "Error grave del rival."], s);
  }
  if (f.classification === "mistake") {
    return pick(["El rival se equivoca.", "Fallo del rival."], s);
  }
  return pick(["El rival no juega lo más preciso.", "Imprecisión del rival."], s);
}

export function composeCoachComment(f: MoveFacts): string | null {
  const a = slotA(f);
  if (!a) return null;
  if (f.isMate && f.evalAfter > 0) return voice(f, a.text);

  // An opponent mistake with something to do about it: state the slip in the
  // third person and spend the sentence on the player's move.
  const opportunity = f.byOpponent ? opportunityClause(f) : null;
  if (opportunity) return `${opponentSlip(f)} ${opportunity}`;

  const b = slotB(f, a.namesMaterial);
  const c = f.byOpponent ? null : slotC(f, a.usedBestMotif ?? false);
  // The outcome of the previous move's opportunity outranks the generic "how the
  // game changed" line: "se te escapó la torre" is the more useful second half.
  const outcome = opportunityOutcome(f);
  const second = outcome ?? c ?? b;
  return voice(f, second ? `${a.text} ${second}` : a.text);
}

/**
 * Puts the finished comment in the right voice.
 *
 * Centralised here because it used to live in GameViewer, which prefixed "Tu
 * oponente: " onto every comment for a move the player didn't make. That breaks
 * the moment the text is already written from the player's side — it would read
 * "Tu oponente: El rival deja el alfil colgado, puedes capturarlo". Only the
 * composer knows whether a given comment still needs the label.
 */
function voice(f: MoveFacts, text: string): string {
  if (!f.byOpponent) return text;
  // Reached only for opponent moves with no opportunity attached — a quiet move,
  // or an error the engine tier didn't reach. The text is still advice to the
  // mover, so the label is what keeps "you" unambiguous.
  return `Tu oponente: ${text}`;
}
