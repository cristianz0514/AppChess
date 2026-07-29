// Translates chess.com English ECO opening names to Spanish.
//
// chess.com stores opening names in English (e.g. "Caro-Kann Defense Advance
// Short Variation"). We translate in two passes: first replace known proper
// opening names (multi-word, longest first), then translate the remaining
// structural words (Defense → Defensa, Variation → Variante, etc.). This
// covers the long tail of variations without needing every full name.

// Proper opening names — matched as whole phrases, longest first so e.g.
// "Queen's Gambit Declined" wins over "Queen's Gambit".
const PROPER_NAMES: [RegExp, string][] = [
  [/Queen'?s Gambit Declined/gi, "Gambito de Dama Rehusado"],
  [/Queen'?s Gambit Accepted/gi, "Gambito de Dama Aceptado"],
  [/Queen'?s Gambit/gi, "Gambito de Dama"],
  [/King'?s Gambit/gi, "Gambito de Rey"],
  [/King'?s Indian Attack/gi, "Ataque India de Rey"],
  [/King'?s Indian/gi, "India de Rey"],
  [/Queen'?s Indian/gi, "India de Dama"],
  [/Queen'?s Pawn(\s+(Opening|Game))?/gi, "Apertura de Peón de Dama"],
  [/King'?s Pawn(\s+(Opening|Game))?/gi, "Apertura de Peón de Rey"],
  [/King'?s Fianchetto(\s+Opening)?/gi, "Apertura Fianchetto de Rey"],
  [/Nimzo[- ]?Indian/gi, "Nimzo-India"],
  [/Nimzowitsch-Larsen/gi, "Nimzowitsch-Larsen"],
  [/Bogo-Indian/gi, "Bogo-India"],
  [/Grünfeld|Grunfeld/gi, "Grünfeld"],
  [/Ruy Lopez|Spanish Game/gi, "Ruy López"],
  [/Italian Game/gi, "Apertura Italiana"],
  [/Giuoco Piano/gi, "Giuoco Piano"],
  [/Sicilian(\s+Defense)?/gi, "Defensa Siciliana"],
  [/French(\s+Defense)?/gi, "Defensa Francesa"],
  [/Caro[ -]?Kann(\s+Defense)?/gi, "Defensa Caro-Kann"],
  [/Scandinavian(\s+Defense)?/gi, "Defensa Escandinava"],
  [/Pirc(\s+Defense)?/gi, "Defensa Pirc"],
  [/Modern Defense/gi, "Defensa Moderna"],
  [/Alekhine('?s)?(\s+Defense)?/gi, "Defensa Alekhine"],
  [/Philidor(\s+Defense)?/gi, "Defensa Philidor"],
  [/Petrov('?s)?(\s+Defense)?|Petroff(\s+Defense)?|Russian Game/gi, "Defensa Petrov"],
  [/Scotch Game|Scotch/gi, "Apertura Escocesa"],
  [/Vienna Game|Vienna/gi, "Apertura Vienesa"],
  [/English Opening|English/gi, "Apertura Inglesa"],
  [/Catalan Opening|Catalan/gi, "Apertura Catalana"],
  [/London System|London/gi, "Sistema Londres"],
  [/Réti Opening|Reti Opening|Réti|Reti/gi, "Apertura Réti"],
  [/Bird's Opening|Bird Opening/gi, "Apertura Bird"],
  [/Slav(\s+Defense)?/gi, "Defensa Eslava"],
  [/Benoni(\s+Defense)?/gi, "Defensa Benoni"],
  [/Benko Gambit|Volga Gambit/gi, "Gambito Benko"],
  [/Dutch(\s+Defense)?/gi, "Defensa Holandesa"],
  [/Trompowsky Attack|Trompowsky/gi, "Ataque Trompowsky"],
  [/Four Knights Game|Four Knights/gi, "Apertura de los Cuatro Caballos"],
  [/Three Knights/gi, "Apertura de los Tres Caballos"],
  [/Two Knights Defense|Two Knights/gi, "Defensa de los Dos Caballos"],
  [/Bishop'?s(\s+Opening)?/gi, "Apertura del Alfil"],
  [/Indian Game|Indian/gi, "India"],
  [/Center Game/gi, "Apertura del Centro"],
  [/Danish Gambit/gi, "Gambito Danés"],
  [/Evans Gambit/gi, "Gambito Evans"],
  [/Ponziani Opening|Ponziani/gi, "Apertura Ponziani"],
  [/Semi-Slav/gi, "Semi-Eslava"],
  [/Tarrasch Defense/gi, "Defensa Tarrasch"],
  [/Old Indian/gi, "India Antigua"],
  [/Polish Opening/gi, "Apertura Polaca"],
];

// Structural words and qualifiers.
const WORDS: [RegExp, string][] = [
  [/\bDeclined\b/gi, "Rehusado"],
  [/\bAccepted\b/gi, "Aceptado"],
  [/\bDefense\b/gi, "Defensa"],
  [/\bGambit\b/gi, "Gambito"],
  [/\bAttack\b/gi, "Ataque"],
  [/\bVariation\b/gi, "Variante"],
  [/\bSystem\b/gi, "Sistema"],
  [/\bOpening\b/gi, "Apertura"],
  [/\bGame\b/gi, "Partida"],
  [/\bMain Line\b/gi, "Línea Principal"],
  [/\bClassical\b/gi, "Clásica"],
  [/\bModern\b/gi, "Moderna"],
  [/\bAdvance\b/gi, "Avance"],
  [/\bExchange\b/gi, "Cambio"],
  [/\bClosed\b/gi, "Cerrada"],
  [/\bOpen\b/gi, "Abierta"],
  [/\bShort\b/gi, "Corta"],
  [/\bLong\b/gi, "Larga"],
  [/\bOld\b/gi, "Antigua"],
  [/\bYoung\b/gi, "Joven"],
  [/\bTwo\b/gi, "Dos"],
  [/\bThree\b/gi, "Tres"],
  [/\bFour\b/gi, "Cuatro"],
  [/\bFianchetto\b/gi, "Fianchetto"],
  [/\bKnights\b/gi, "Caballos"],
  [/\bKnight\b/gi, "Caballo"],
  [/\bBishops\b/gi, "Alfiles"],
  [/\bBishop\b/gi, "Alfil"],
  [/\bQueenside\b/gi, "Flanco de Dama"],
  [/\bKingside\b/gi, "Flanco de Rey"],
  [/\bQueens\b/gi, "Dama"],
  [/\bKings\b/gi, "Rey"],
  [/\bQueen\b/gi, "Dama"],
  [/\bKing\b/gi, "Rey"],
  [/\bEast\b/gi, "Este"],
  [/\bWest\b/gi, "Oeste"],
  [/\bPawn\b/gi, "Peón"],
  [/\bSacrifice\b/gi, "Sacrificio"],
  [/\bDouble\b/gi, "Doble"],
  [/\bBlack\b/gi, "Negras"],
  [/\bWhite\b/gi, "Blancas"],
  [/\bNormal\b/gi, "Normal"],
  [/\bCheck\b/gi, "Jaque"],
  [/\bCenter\b/gi, "Centro"],
  [/\bAccelerated\b/gi, "Acelerada"],
  [/\bDelayed\b/gi, "Diferida"],
  [/\bDragon\b/gi, "Dragón"],
  [/\bHyperaccelerated\b/gi, "Hiperacelerada"],
  [/\bWith\b/gi, "con"],
  [/\bVariation\b/gi, "Variante"],
  [/\bLine\b/gi, "Línea"],
  [/\bUnknown\b/gi, "Apertura Desconocida"],
];

export function translateOpening(name: string | null | undefined): string {
  if (!name) return "Apertura Desconocida";
  let out = name.trim();
  for (const [re, es] of PROPER_NAMES) out = out.replace(re, es);
  for (const [re, es] of WORDS) out = out.replace(re, es);
  return out;
}

/**
 * Just the opening FAMILY, for interpolating into a sentence — or null.
 *
 * translateOpening() renders the full ECO name word-by-word, which is fine as a
 * label in its own column and not Spanish inside a sentence: "Caro Kann Defense
 * Advance Short Variation with 4 Nf3...e6" comes out "Defensa Caro-Kann Avance
 * Corta Variante con 4 Nf3...e6".
 *
 * Trimming that string doesn't help either, because translation REORDERS the
 * family word to the front in Spanish ("Defensa Caro-Kann"), so "everything up to
 * the family word" is just "Defensa". Attempts at it produced "Defensa Escandinava
 * Mieses" and "Ataque India de".
 *
 * So this doesn't parse anything. It returns the hand-written Spanish name from
 * PROPER_NAMES when one matches, and null otherwise. Those strings are correct by
 * construction because a human wrote them. Naming the opening is a nice touch, not
 * a requirement — saying nothing beats saying "Ataque India de", and the caller
 * already handles null by dropping the clause.
 */
export function openingFamily(name: string | null | undefined): string | null {
  if (!name) return null;
  for (const [re, es] of PROPER_NAMES) {
    // The regexes are global, so lastIndex must not carry between calls.
    re.lastIndex = 0;
    if (re.test(name)) return es;
  }
  return null;
}
