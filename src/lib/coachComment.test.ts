import { describe, it, expect } from "vitest";
import { composeCoachComment, STANDING_RULES, QUIET_RULES, OPPONENT_RULES, type MoveFacts } from "./coachComment";

// Each test pins a contradiction or seam that shipped in real comments (found by reading the
// output of the real pipeline over real games — see docs/MOTOR-DE-COMENTARIOS.md).
const facts = (o: Partial<MoveFacts> = {}): MoveFacts => ({
  variantSeed: 6,
  playedPiece: "caballo", playedTo: "f3", isMate: false, capturedPiece: null,
  classification: "best", good: false,
  evalBefore: 0.3, evalAfter: 0.3,
  bestPiece: null, bestTo: null, bestCapturedPiece: null, bestGivesCheck: false,
  bestIsCastle: false, bestIsCenterPawn: false, bestDefendsHung: false,
  onlyGoodMove: false, missedForcedMate: false,
  selfHang: null, playedMotifs: [], bestMotifs: [],
  materialLostPiece: null, materialNet: 0, materialSettled: false, materialTrades: false,
  oppCapturesPiece: null, isSacrificeConfirmed: false,
  ...o,
});

const story = (o: Partial<NonNullable<MoveFacts["story"]>> = {}): NonNullable<MoveFacts["story"]> => ({
  kind: "none", allows: null, better: null, achieves: null, ...o,
});

describe("a move never contradicts its own badge", () => {
  const missed = { piece: "caballo", to: "d6", captures: null };

  it("no 'Se te escapó' on a move rated best or excellent", () => {
    for (const classification of ["best", "excellent", "good"]) {
      const t = composeCoachComment(facts({ classification, tookOpportunity: false, missedOpportunity: missed }))!;
      expect(t).not.toMatch(/se te escapó|ahí estaba la oportunidad/i);
    }
  });

  it("the reproach IS said about a real error, with its verified reason", () => {
    const t = composeCoachComment(facts({
      classification: "mistake", evalBefore: 1.5, evalAfter: 0.2, tookOpportunity: false,
      missedOpportunity: { ...missed, how: "con el caballo a d6 te llevabas el peón de a4" },
      bestPiece: "caballo", bestTo: "d6",
    }))!;
    expect(t).toContain("con el caballo a d6 te llevabas el peón de a4");
  });

  it("'la mejor de la posición' only for a best move", () => {
    const best = composeCoachComment(facts({ classification: "best", good: true }))!;
    const second = composeCoachComment(facts({ classification: "excellent", good: true }))!;
    expect(best).toMatch(/la mejor de la posición/);
    expect(second).not.toMatch(/la mejor de la posición/);
  });

  it("never says the advantage was wasted after a good move", () => {
    for (const classification of ["best", "excellent", "good"]) {
      const t = composeCoachComment(facts({ classification, evalBefore: 4.2, evalAfter: 3.6 }))!;
      expect(t).not.toMatch(/desperdicias|dejas escapar|cediste terreno/i);
    }
  });

  it("does not claim a lost advantage inside a won position for a small drop", () => {
    const t = composeCoachComment(facts({ classification: "inaccuracy", evalBefore: 6.9, evalAfter: 6.0 }));
    expect(t ?? "").not.toMatch(/desperdicias/);
  });
});

describe("the rival's opportunities must gain something", () => {
  it("a quiet opportunity is not announced", () => {
    const t = composeCoachComment(facts({
      byOpponent: true, classification: "mistake", evalBefore: 0.1, evalAfter: -1.5,
      opportunity: { piece: "peón", to: "a5", captures: null, isMate: false, plan: "y después el peón a c6" },
    }))!;
    expect(t).not.toMatch(/tu oportunidad|aprovéchalo/i);
  });

  it("a capture is", () => {
    const t = composeCoachComment(facts({
      byOpponent: true, classification: "mistake", evalBefore: 0.1, evalAfter: -2,
      opportunity: { piece: "alfil", to: "d5", captures: "caballo", isMate: false, plan: null },
    }))!;
    expect(t).toMatch(/caballo/);
  });

  it("an error with nothing to hand over keeps the move's own description and adds its cost", () => {
    const t = composeCoachComment(facts({
      byOpponent: true, classification: "mistake", evalBefore: 0.1, evalAfter: -1.2,
      playedPiece: "caballo", playedTo: "h6", knightToRim: true,
    }))!;
    expect(t).toMatch(/h6/);
    expect(t).toMatch(/pasa de igualada a algo mejor para ti/);
  });
});

describe("the verified story takes precedence", () => {
  it("an error with a consequence says it, then what was better", () => {
    const t = composeCoachComment(facts({
      classification: "blunder", evalBefore: 0.5, evalAfter: -3,
      story: story({ kind: "undefended", allows: "El caballo en e5 queda sin defensa y el alfil del rival se lo lleva.", better: "Con el alfil a b5 evitabas perderlo." }),
    }))!;
    expect(t).toBe("El caballo en e5 queda sin defensa y el alfil del rival se lo lleva. Con el alfil a b5 evitabas perderlo.");
  });

  it("a rival's error is told from the player's side without a repeated subject", () => {
    const t = composeCoachComment(facts({
      byOpponent: true, classification: "blunder", evalBefore: 0, evalAfter: -3,
      story: story({ kind: "undefended", allows: "El rival deja el caballo en c6 sin defensa: te lo llevas con el alfil." }),
    }))!;
    expect(t).toBe("El rival deja el caballo en c6 sin defensa: te lo llevas con el alfil.");
  });

  it("when the real error is a missed win, only the win is said", () => {
    const t = composeCoachComment(facts({
      classification: "mistake", evalBefore: 8, evalAfter: 3.8,
      story: story({ kind: "missedWin", better: "Con la dama a d4 atacabas la torre de a1 y el alfil de e3 a la vez, y ganabas muchísimo material." }),
    }))!;
    expect(t).toBe("Con la dama a d4 atacabas la torre de a1 y el alfil de e3 a la vez, y ganabas muchísimo material.");
  });

  it("a line that settles to no loss overrules the legacy 'te captura la torre'", () => {
    const base = { classification: "blunder", evalBefore: 3.4, evalAfter: 0.9, oppCapturesPiece: "torre", punishFollowUp: "y luego el alfil a d5" };
    expect(composeCoachComment(facts(base))!).toMatch(/te captura la torre/);
    const t = composeCoachComment(facts({ ...base, story: story({ net: 0 }) }))!;
    expect(t).not.toMatch(/te captura la torre/);
  });

  it("a good move's story does not talk over a mate on the board", () => {
    const t = composeCoachComment(facts({
      classification: "best", good: true, evalBefore: 9990, evalAfter: 9991,
      story: story({ kind: "wins", achieves: "Con la dama a a8 el rival ya no puede evitar perder la dama: la dama de b8 caerá." }),
    }));
    expect(t ?? "").not.toMatch(/caerá/);
  });
});

describe("repetition", () => {
  it("every standing rule names a rule that exists (a typo would silently never suppress)", () => {
    const ids = new Set([...QUIET_RULES, ...OPPONENT_RULES].map((r) => r.id));
    for (const id of STANDING_RULES) expect(ids.has(id), id).toBe(true);
  });

  const standing = { connectedPassed: ["c4", "b3"], isEndgame: true, evalBefore: 6, evalAfter: 6 };
  const text = (o: Partial<MoveFacts> = {}) => composeCoachComment(facts({ playedPiece: "torre", playedTo: "e1", ...standing, ...o }))!;

  it("a standing fact that just spoke steps aside", () => {
    const first = text();
    expect(first).toMatch(/pasados conectados/);
    const info: { winner?: string } = {};
    composeCoachComment(facts({ playedPiece: "torre", playedTo: "e1", ...standing }), info);
    expect(info.winner).toBeDefined();
    expect(STANDING_RULES.has(info.winner!)).toBe(true);
    const next = text({ recentRules: [info.winner!] });
    expect(next).not.toMatch(/pasados conectados/);
    expect(next.length).toBeGreaterThan(0);
  });

  it("theory is commented at the start and at the end of the book, not in between", () => {
    const early = composeCoachComment(facts({ isBook: true, variantSeed: 1, toCenter: true, playedPiece: "peón", playedTo: "e4" }))!;
    const middle = composeCoachComment(facts({ isBook: true, variantSeed: 8, developsPiece: true }))!;
    const end = composeCoachComment(facts({ isBook: true, variantSeed: 8, isLastBookMove: true, openingName: "Apertura Italiana" }))!;
    expect(early).toMatch(/libro|teoría/i);
    expect(middle).not.toMatch(/libro|teoría/i);
    expect(end).toMatch(/Apertura Italiana/);
  });
});

describe("template seams", () => {
  it("a hanging rook is 'colgada', not 'colgado'", () => {
    const t = composeCoachComment(facts({
      classification: "mistake", evalBefore: 1, evalAfter: -1,
      selfHang: { piece: "torre", square: "d7" }, variantSeed: 4,
    }))!;
    expect(t).not.toMatch(/torre[^.]*colgado/);
  });

  it("a double threat with a check is not reported as a discovered check", () => {
    const t = composeCoachComment(facts({
      byOpponent: true, classification: "best",
      playedMotifs: [{ key: "double", label: "doble amenaza con jaque" }],
    }))!;
    expect(t).not.toMatch(/descubierta/);
  });
});
