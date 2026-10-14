import { describe, it, expect } from "vitest";
import { buildStory, replay, lineNet, settledBalance, forkTargets, worth, tempoStory, wrongPieceStory, type StoryInput } from "./lineStory";

// Positions are hand-built so each one isolates ONE cause. The engine lines are supplied by
// the test (the module reads lines, it does not search), which is what makes these
// deterministic: the claim under test is "given this line, is the story true and worded
// right?", not "does Stockfish find it?".
const base = (o: Partial<StoryInput> & Pick<StoryInput, "fenBefore" | "playedSan" | "mover">): StoryInput => ({
  byOpponent: false, reply: [], best: [], evalBefore: 0, evalAfter: 0, classification: "blunder", good: false, ...o,
});

const KNIGHT_TAKES_PAWN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const BISHOP_ATTACKS_KNIGHT = "4k3/8/8/b7/8/2N5/8/4K3 w - - 0 1";
const KNIGHT_FORK = "r3k3/7p/8/3N4/8/8/8/4K3";

describe("material accounting", () => {
  it("settles a line that stops in the middle of an exchange", () => {
    const L = replay(KNIGHT_TAKES_PAWN, ["Nxe5", "Nxe5"]);
    expect(lineNet(KNIGHT_TAKES_PAWN, L, "w")).toBe(-2);
    expect(lineNet(KNIGHT_TAKES_PAWN, L, "b")).toBe(2);
  });

  it("does not count a capture whose recapture falls outside the window", () => {
    const L = replay(KNIGHT_TAKES_PAWN, ["Nxe5"]);
    expect(lineNet(KNIGHT_TAKES_PAWN, L, "w")).toBe(-2);   // quiescence lets black retake
  });

  it("settledBalance is symmetric", () => {
    const fen = "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1";
    expect(settledBalance(fen, "w") + settledBalance(fen, "b")).toBe(0);
  });

  it("words a swing the way a player would say it", () => {
    expect(worth(1)).toBe("un peón");
    expect(worth(3, "n")).toBe("una pieza");
    expect(worth(5, "r")).toBe("una torre");
    expect(worth(9, "q")).toBe("la dama");
  });
});

describe("what a move allows", () => {
  it("names the piece that hangs and why: the moved piece, undefended", () => {
    const s = buildStory(base({ fenBefore: KNIGHT_TAKES_PAWN, playedSan: "Nxe5", mover: "w", reply: ["Nxe5"], evalBefore: 0.3, evalAfter: -1.8 }));
    expect(s?.kind).toBe("undefended");
    expect(s?.allows).toContain("caballo en e5 queda sin defensa");
    expect(s?.allows).toContain("se lo lleva");
  });

  it("an unguard: the piece lost its only defender when the defender moved", () => {
    const fen = "1b2k3/8/8/4N3/8/2B5/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Bb4", mover: "w", reply: ["Bxe5"], evalBefore: 0, evalAfter: -3 }));
    expect(s?.kind).toBe("unguard");
    expect(s?.allows).toContain("Al mover el alfil dejas sin defensa el caballo de e5");
  });

  it("an ignored threat: the piece was already attacked and the move did nothing", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", reply: ["Bxc3"], evalBefore: 0, evalAfter: -3 }));
    expect(s?.kind).toBe("ignored");
    expect(s?.allows).toContain("ya estaba atacado y no lo atendiste");
  });

  it("a knight fork of king and rook, named only because the line collects", () => {
    const s = buildStory(base({ fenBefore: `${KNIGHT_FORK} b - - 0 1`, playedSan: "h6", mover: "b", reply: ["Nc7+", "Kd7", "Nxa8"], evalBefore: -2, evalAfter: -7 }));
    expect(s?.kind).toBe("fork");
    expect(s?.allows).toContain("Permites un doble");
    expect(s?.allows).toBe("Permites un doble con jaque: el caballo del rival llega a c7, da jaque y ataca también la torre de a8. Acabas perdiendo una torre.");
      });

  it("does NOT name a fork the line never collects on", () => {
    // Same fork geometry, but black simply takes the knight: nothing is lost.
    const s = buildStory(base({ fenBefore: `${KNIGHT_FORK} b - - 0 1`, playedSan: "h6", mover: "b", reply: ["Nc7+", "Kd7", "Kxc7"], evalBefore: -2, evalAfter: -2 }));
    expect(s?.allows ?? null).toBeNull();
  });

  it("a mate against: a line that ends in checkmate is the proof", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Nf6", mover: "b", reply: ["Qxf7#"], evalBefore: 0, evalAfter: -9999 }));
    expect(s?.kind).toBe("mate");
    expect(s?.allows).toBe("Esta jugada permite jaque mate: la dama del rival remata en f7.");
  });

  it("the shortest mate there is", () => {
    // 1.f3 e5 2.g4 and black mates with Qh4.
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2";
    const s = buildStory(base({ fenBefore: fen, playedSan: "g4", mover: "w", reply: ["Qh4#"], evalBefore: 0, evalAfter: -9999 }));
    expect(s?.allows).toBe("Esta jugada permite jaque mate: la dama del rival remata en h4.");
  });

  it("stays silent when the evaluation does not back the material claim", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", reply: ["Bxc3"], evalBefore: -2, evalAfter: -2.1 }));
    expect(s?.allows ?? null).toBeNull();
  });

  it("says nothing about a quiet exchange that nets zero", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3";
    const s = buildStory(base({ fenBefore: fen, playedSan: "exd4", mover: "b", reply: ["Nxd4", "Nxd4"], classification: "mistake", evalBefore: 0, evalAfter: -0.6 }));
    expect(s?.allows ?? null).toBeNull();
  });

  it("an opponent's error is told from the player's side", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", byOpponent: true, reply: ["Bxc3"], evalBefore: 0, evalAfter: -3 }));
    expect(s?.allows).toContain("El rival no atiende tu amenaza");
    expect(s?.allows).toContain("te lo llevas con el alfil");
    expect(s?.better).toBeNull();   // advice to the rival is useless to the player
  });
});

describe("a loss in an already decisive position", () => {
  it("is told even though the evaluation barely moves: at -4 it does not track material", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", reply: ["Bxc3"], evalBefore: -4, evalAfter: -4.1 }));
    expect(s?.kind).toBe("ignored");
    expect(s?.allows).toContain("ya estaba atacado y no lo atendiste");
  });
});

describe("what the better move did", () => {
  it("a capture that wins the queen", () => {
    const fen = "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Kf2", mover: "w", best: ["Nxd5"], reply: ["Qd4+"], evalBefore: 9, evalAfter: -1 }));
    expect(s?.better).toBe("Con el caballo a d5 te llevabas la dama.");
  });

  it("is absent when the best move wins nothing", () => {
    const s = buildStory(base({ fenBefore: KNIGHT_TAKES_PAWN, playedSan: "a3", mover: "w", best: ["Bb5", "a6"], reply: ["Nf6"], classification: "inaccuracy", evalBefore: 0.3, evalAfter: 0 }));
    expect(s?.better ?? null).toBeNull();
  });

  it("is absent when the played move IS the best move", () => {
    const fen = "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Nxd5", mover: "w", best: ["Nxd5"], classification: "inaccuracy" }));
    expect(s?.better ?? null).toBeNull();
  });
});

describe("a good move", () => {
  it("a fork that wins material is described as one", () => {
    const s = buildStory(base({ fenBefore: `${KNIGHT_FORK} w - - 0 1`, playedSan: "Nc7+", mover: "w", reply: ["Kd7", "Nxa8"], classification: "great", good: true, evalBefore: 0, evalAfter: 5 }));
    expect(s?.kind).toBe("fork");
    expect(s?.achieves).toBe("Con el caballo a c7 das jaque y atacas también la torre de a8: el rival no puede evitar perder una torre.");
  });

  it("stays silent for a plain capture the legacy comment already states", () => {
    const fen = "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Nxd5", mover: "w", reply: ["Kd7"], classification: "great", good: true }));
    expect(s?.achieves ?? null).toBeNull();
  });
});

describe("what a quiet move is for", () => {
  it("a pawn the line walks to the last rank", () => {
    // White pawn on a6; the line is a6-a7, ...Kf8, a8=Q.
    const fen = "4k3/8/P7/8/8/8/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "a7", mover: "w", reply: ["Kd7", "a8=Q+"], classification: "best", good: true, evalBefore: 3, evalAfter: 3 }));
    expect(s?.kind).toBe("promotes");
    expect(s?.achieves).toBe("La línea principal lleva este peón a coronar en a8, en 2 jugadas.");
    expect(s?.key).toBe("promo:a8");
  });

  it("does not call a capture or a promotion a quiet idea", () => {
    const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "a8=Q+", mover: "w", reply: ["Kd7"], classification: "best", good: true }));
    expect(s?.achieves ?? null).toBeNull();
  });

  it("a queen trade the line makes, when nobody comes out ahead", () => {
    // Qd2 faces Qd7 on the d-file, defended by the rook; white makes a quiet move and the line
    // trades the queens: ...Qxd2 Rxd2.
    const fen = "4k3/3q4/8/8/8/8/3Q4/3RK3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Kf1", mover: "w", reply: ["Qxd2", "Rxd2"], classification: "best", good: true }));
    expect(s?.kind).toBe("queenTrade");
    expect(s?.achieves).toBe("Con esto se llega al cambio de damas: la línea principal las cambia y la partida se simplifica.");
  });

  it("is not a queen trade when the queen is simply lost", () => {
    const fen = "3qk3/8/8/8/8/8/3Q4/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Qd5", mover: "w", reply: ["Qxd5"], classification: "good", good: true }));
    expect(s?.achieves ?? null).toBeNull();
  });

  it("announces a gain the move CREATES, with a key so the caller can say it once", () => {
    // Ne2 cannot take the queen; Nc3 attacks it and the line collects: ...Kd7 Nxd5.
    const fen = "4k3/8/8/3q4/8/8/4N3/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Nc3", mover: "w", reply: ["Kd7", "Nxd5"], classification: "good", good: true }));
    expect(s?.kind).toBe("wins");
    expect(s?.achieves).toBe("Con el caballo a c3 el rival ya no puede evitar perder la dama: la dama de d5 caerá.");
    expect(s?.key).toBe("wins:qd5");
  });

  it("does NOT credit a move for a gain that was already on the board", () => {
    // The knight on c3 already attacks the loose queen: a quiet king move merely keeps the win.
    const fen = "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Ke2", mover: "w", reply: ["Kd7", "Nxd5"], classification: "good", good: true }));
    expect(s?.achieves ?? null).toBeNull();
  });

  it("does not tell an exchange as 'el rival ya no puede evitar perder'", () => {
    const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "exd5", mover: "w", reply: ["Kd7", "Kd2", "Kd6", "Kd3", "Kxd5"], classification: "good", good: true }));
    expect(s?.achieves ?? null).toBeNull();
  });
});

describe("losing a tempo", () => {
  // 1.e4 e5 2.Nf3 Nc6, then white goes Bb5 and the a6 pawn kicks the bishop.
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  const inp = (best: string[], byOpponent = false) => base({
    fenBefore: fen, playedSan: "Bb5", mover: "w", byOpponent, reply: ["a6", "Ba4"], best,
    evalBefore: 0.3, evalAfter: -0.2, classification: "inaccuracy",
  });

  it("the reply attacks the piece with something cheaper and it has to move again", () => {
    const s = buildStory(inp(["Nc3", "Nf6", "Bb5"]));
    expect(s?.kind).toBe("positional");
    expect(s?.allows).toBe("El peón del rival ataca el alfil en b5 y tienes que moverlo otra vez: pierdes un tiempo.");
    expect(s?.better).toBe("Con el caballo a c3 no lo perdías.");
  });

  it("told from the player's side when the rival is the one who loses it", () => {
    const s = buildStory(inp(["Nc3", "Nf6", "Bb5"], true));
    expect(s?.allows).toBe("Con el peón a a6 atacas el alfil del rival en b5 y tiene que moverse otra vez: ganas un tiempo.");
  });

  it("is silent when the best line loses the same tempo", () => {
    const s = buildStory(inp(["Bc4", "a6", "Bb3"]));
    expect(s?.allows ?? "").not.toMatch(/pierdes un tiempo/);
  });

  it("is silent when the attacker is not cheaper and the piece is defended", () => {
    // A knight attacks a defended knight: trading is available, nothing is forced to move.
    const f2 = "4k3/8/8/8/3n4/8/8/R3K2N w - - 0 1";
    const s = tempoStory(replay(f2, ["Nf2", "Nb3", "Ng4"]), base({ fenBefore: f2, playedSan: "Nf2", mover: "w", reply: ["Nb3", "Ng4"], best: ["Ra4"] }));
    expect(s).toBeNull();
  });
});

describe("capturing with the wrong piece", () => {
  // White can take the d5 pawn with the knight or with the rook; the pawn on e6 retakes either.
  const fen = "4k3/8/4p3/3p4/8/2N5/3R4/4K3 w - - 0 1";
  const L = replay(fen, ["Rxd5", "exd5"]);

  it("names the dearer piece that was exchanged and the cheaper one that could have been", () => {
    const s = wrongPieceStory(L, base({ fenBefore: fen, playedSan: "Rxd5", mover: "w", reply: ["exd5"], best: ["Nxd5", "exd5"] }));
    expect(s?.cause).toBe("Capturas en d5 con la torre y te la recapturan: es el cambio más caro.");
    expect(s?.contrast).toBe("Con el caballo a d5 cambiabas más barato.");
  });

  it("is silent when the played piece is the cheaper one", () => {
    const L2 = replay(fen, ["Nxd5", "exd5"]);
    expect(wrongPieceStory(L2, base({ fenBefore: fen, playedSan: "Nxd5", mover: "w", reply: ["exd5"], best: ["Rxd5", "exd5"] }))).toBeNull();
  });

  it("is silent when the best move captures somewhere else", () => {
    expect(wrongPieceStory(L, base({ fenBefore: fen, playedSan: "Rxd5", mover: "w", reply: ["exd5"], best: ["Nb5"] }))).toBeNull();
  });
});

describe("geometry", () => {
  it("counts the king as a fork target", () => {
    const L = replay(`${KNIGHT_FORK} w - - 0 1`, ["Nc7+"]);
    const t = forkTargets(L[0]);
    expect(t?.map((x) => x.piece)).toEqual(["k", "r"]);
  });

  it("an illegal reply yields no text — nothing is invented from a line that does not replay", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", reply: ["Qxz9"] }));
    expect(s?.allows ?? null).toBeNull();
    expect(s?.better ?? null).toBeNull();
    expect(s?.achieves ?? null).toBeNull();
    // ...and a played move that is not even legal here yields no story at all.
    expect(buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Qh5", mover: "w", reply: [] }))).toBeNull();
  });
});

describe("evidence the legacy rules must respect", () => {
  it("exposes the settled net so an exchange the player recaptures is not reported as a loss", () => {
    // Black rook takes a pawn on c3, white rook takes it, the other black rook retakes: even.
    const fen = "6k1/8/8/8/8/2P5/8/r1r2K1R b - - 0 1";
    const s = buildStory(base({ fenBefore: fen, playedSan: "Rxc3", mover: "b", reply: ["Rxc3"], classification: "blunder", evalBefore: 3, evalAfter: 0.5 }));
    expect(s?.net).toBeDefined();
  });

  it("flags a sacrifice only when the engine's reply really takes the moved piece", () => {
    // White plays Nxe5 and the engine's answer is Nxe5: a knight (3) given for a pawn (1).
    const taken = buildStory(base({ fenBefore: KNIGHT_TAKES_PAWN, playedSan: "Nxe5", mover: "w", reply: ["Nxe5"], classification: "best" }));
    expect(taken?.sacrifice).toBe(true);
    // Same move, but the engine's reply ignores the knight: not a sacrifice.
    const declined = buildStory(base({ fenBefore: KNIGHT_TAKES_PAWN, playedSan: "Nxe5", mover: "w", reply: ["Qe7"], classification: "best" }));
    expect(declined?.sacrifice).toBe(false);
  });

  it("remembers what the player missed after the rival's error, with the reason", () => {
    const s = buildStory(base({ fenBefore: BISHOP_ATTACKS_KNIGHT, playedSan: "Kf2", mover: "w", byOpponent: true, reply: ["Bxc3"], evalBefore: 0, evalAfter: -3 }));
    expect(s?.missed).toBe("con el alfil a c3 te llevabas el caballo");
  });
});
