import { describe, it, expect } from "vitest";
import { compareEndpoints, describeDifference, differences, profile } from "./positionalDiff";
import { buildStory } from "./lineStory";

// Each case isolates ONE feature: two boards that differ in a single way, so the test says
// "this difference is found, and worded right" — not "the heuristics happen to agree".
const diff = (played: string, best: string, me: "w" | "b" = "w") => compareEndpoints(played, best, me);

describe("what differs between where the move leads and where the best move leads", () => {
  it("an open file the rival now controls", () => {
    const d = diff("2r1k3/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 1", "2r1k3/pp3ppp/8/8/8/8/PP3PPP/2R3K1 w - - 0 1");
    expect(d?.key).toBe("openFile");
    expect(d?.file).toBe("c");
    expect(describeDifference(d!, true, "la torre a c1").cause).toBe("En la línea principal el rival se hace con la columna c.");
  });

  it("says 'la controlabas tú' only when the best line really had the file", () => {
    // Best line: white rook on c, the black rook elsewhere (same material on both boards).
    const d = diff("2r1k3/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 1", "3rk3/pp3ppp/8/8/8/8/PP3PPP/2R3K1 w - - 0 1");
    expect(d?.bestHadIt).toBe(true);
    expect(describeDifference(d!, true, "la torre a c1").contrast).toBe("Con la torre a c1 la controlabas tú.");
  });

  it("a passed pawn the rival gets", () => {
    // Same material; in the best line a white pawn on b2 stops the b3 pawn, in the played one it is on h2.
    const d = diff("4k3/8/8/8/8/1p6/7P/4K3 w - - 0 1", "4k3/8/8/8/8/1p6/1P6/4K3 w - - 0 1");
    expect(d?.key).toBe("oppPassed");
    expect(d?.square).toBe("b3");
    expect(describeDifference(d!, true, null).cause).toBe("En la línea principal el rival consigue un peón pasado en b3.");
  });

  it("a king that can no longer castle, with the queens still on", () => {
    const d = diff("r2qk2r/8/8/8/8/8/8/3QK2R w - - 0 1", "r2qk2r/8/8/8/8/8/8/3Q1RK1 w - - 0 1");
    expect(d?.key).toBe("castling");
    expect(describeDifference(d!, true, "el rey a g1").contrast).toBe("Con el rey a g1 enrocabas.");
  });

  it("does NOT say a king is stuck in the centre once the queens are off", () => {
    expect(diff("r3k2r/8/8/8/8/8/8/4K2R w - - 0 1", "r3k2r/8/8/8/8/8/8/5RK1 w - - 0 1")).toBeNull();
  });

  it("a knight the rival plants where no pawn of ours can remove it", () => {
    // Played: the black knight sits on d4 and we have no pawns. Best: it is still on g8.
    const d = diff("4k3/8/8/8/3n4/8/8/4K3 w - - 0 1", "4k1n1/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(d?.key).toBe("oppOutpost");
    expect(d?.square).toBe("d4");
    expect(describeDifference(d!, true, "el caballo a e2").cause).toBe("En la línea principal el caballo del rival se instala en d4, donde ningún peón tuyo puede echarlo.");
  });

  it("is not an outpost while a pawn of ours can still attack the square", () => {
    // The pawn on c2 can reach c3 and challenge d4.
    expect(diff("4k3/8/8/8/3n4/8/2P5/4K3 w - - 0 1", "4k1n1/8/8/8/8/8/2P5/4K3 w - - 0 1")).toBeNull();
  });

  it("works from black's side", () => {
    const d = diff("4k3/8/8/3N4/8/8/8/4K3 b - - 0 1", "4k3/8/8/8/8/8/8/4K1N1 b - - 0 1", "b");
    expect(d?.key).toBe("oppOutpost");
    expect(d?.square).toBe("d5");
  });

  it("a bishop locked in by its own pawns", () => {
    const d = diff("4k3/8/8/8/8/8/1PPP4/2B1K3 w - - 0 1", "4k3/8/8/8/8/4B3/1PPP4/4K3 w - - 0 1");
    expect(d?.key).toBe("passive");
    expect(d?.square).toBe("c1");
  });

  it("words a boxed-in piece and a badly placed one differently, and invents no numbers", () => {
    const boxed = describeDifference({ key: "passive", score: 2, piece: "b", square: "c1", reason: "entombed" }, true, "el alfil a e3");
    expect(boxed.cause).toBe("En la línea principal el alfil de c1 queda encerrado, casi sin casillas.");
    expect(boxed.contrast).toBe("Con el alfil a e3 no quedaba encerrado.");
    const poor = describeDifference({ key: "passive", score: 2, piece: "n", square: "h4", reason: "badSquare" }, false, null);
    expect(poor.cause).toBe("El caballo del rival en h4 queda mal colocado, con poca influencia.");
    const mob = describeDifference({ key: "mobility", score: 2, from: 40, to: 24 }, true, null);
    expect(mob.cause).not.toMatch(/[0-9]/);
  });

  it("a king under attack that was safe in the best line", () => {
    const d = diff("4k3/8/8/8/8/5q2/8/4K3 w - - 0 1", "q3k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(d?.key).toBe("kingExposed");
    expect(d!.to!).toBeGreaterThan(d!.from!);
  });

  it("doubled pawns", () => {
    const d = diff("4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1", "4k3/8/8/8/8/3P4/2P5/4K3 w - - 0 1");
    expect(d?.key).toBe("doubled");
    expect(d?.file).toBe("c");
  });

  it("nothing is reported when the two boards are alike", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    expect(diff(fen, fen)).toBeNull();
  });

  it("never reports a difference that favours the mover", () => {
    // The played board is the BETTER one: the rival has the doubled pawns.
    const d = diff("4k3/8/8/8/8/3P4/2P5/4K3 w - - 0 1", "4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1");
    expect(d).toBeNull();
  });

  it("is silent when the material differs: that is the material story's business", () => {
    expect(diff("2r1k3/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 1", "2r1k3/pp3ppp/8/8/8/8/PP3PPP/R3R1K1 w - - 0 1")).toBeNull();
  });

  it("asks for a bigger difference to explain a bigger error", () => {
    // Doubled pawns are worth 1.5: enough for an inaccuracy, not for a blunder.
    const played = "4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1", best = "4k3/8/8/8/8/3P4/2P5/4K3 w - - 0 1";
    expect(compareEndpoints(played, best, "w", 1.5)?.key).toBe("doubled");
    expect(compareEndpoints(played, best, "w", 3)).toBeNull();
  });

  it("works for black as the mover", () => {
    // Same open-file position mirrored: the white rook owns the file, black is `me`.
    const d = diff("4r1k1/pp3ppp/8/8/8/8/PP3PPP/2R1K3 b - - 0 1", "2r3k1/pp3ppp/8/8/8/8/PP3PPP/2R1K3 b - - 0 1", "b");
    expect(d?.key).toBe("openFile");
  });

  it("profile counts what it says it counts", () => {
    const p = profile("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1", "w");
    expect(p.bishops).toBe(2);
    expect(p.oppBishops).toBe(2);
    expect(p.castleRights).toBe(true);
    expect(p.castled).toBe(false);
  });

  it("differences are sorted strongest first and respect the threshold", () => {
    const worse = profile("4k3/8/8/8/8/1p6/7P/4K3 w - - 0 1", "w");
    const better = profile("4k3/8/8/8/8/1p6/1P6/4K3 w - - 0 1", "w");
    const ds = differences(worse, better);
    expect(ds[0].key).toBe("oppPassed");
    for (const d of ds) expect(d.score).toBeGreaterThanOrEqual(1.5);
  });
});

describe("the positional story over real lines", () => {
  // White gives up the bishop pair for nothing: Bxc6 dxc6, against castling and keeping it.
  const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

  it("an error with no material and no tactic is explained by the position it leads to", () => {
    const s = buildStory({
      fenBefore: fen, playedSan: "Bxc6", mover: "w", byOpponent: false,
      reply: ["dxc6", "O-O", "Bd6"], best: ["O-O", "Nf6", "d3", "Bd6"],
      evalBefore: 0.4, evalAfter: -0.3, classification: "inaccuracy", good: false,
    });
    expect(s?.kind).toBe("positional");
    expect(s?.allows).toBe("En la línea principal te quedas sin la pareja de alfiles.");
    expect(s?.better).toBe("Con el rey a g1 la conservabas.");
  });

  it("the same difference told from the player's side when the RIVAL made the move", () => {
    const s = buildStory({
      fenBefore: fen, playedSan: "Bxc6", mover: "w", byOpponent: true,
      reply: ["dxc6", "O-O", "Bd6"], best: ["O-O", "Nf6", "d3", "Bd6"],
      evalBefore: 0.4, evalAfter: -0.3, classification: "inaccuracy", good: false,
    });
    expect(s?.allows).toBe("El rival se queda sin la pareja de alfiles.");
    expect(s?.better).toBeNull();
  });

  it("is not told when the lines differ in material", () => {
    const s = buildStory({
      fenBefore: fen, playedSan: "Bxc6", mover: "w", byOpponent: false,
      reply: ["dxc6", "Nxe5", "Qd4"], best: ["O-O", "Nf6", "d3", "Bd6"],
      evalBefore: 0.4, evalAfter: -0.3, classification: "inaccuracy", good: false,
    });
    expect(s?.kind).not.toBe("positional");
  });

  it("is not told when the lines are too short to compare at a quiet point", () => {
    const s = buildStory({
      fenBefore: fen, playedSan: "Bxc6", mover: "w", byOpponent: false,
      reply: ["dxc6"], best: ["O-O"],
      evalBefore: 0.4, evalAfter: -0.3, classification: "inaccuracy", good: false,
    });
    expect(s?.kind).not.toBe("positional");
  });
});
