import { describe, expect, it } from "vitest";
import { endedByAbandonment, parseGame, parseGames } from "./pgnParser";
import type { ChessComGame } from "./chesscom";

const pgn = (termination: string) => `[Event "Live Chess"]
[Site "Chess.com"]
[ECOUrl "https://www.chess.com/openings/Italian-Game-Giuoco-Piano"]
[Termination "${termination}"]

1. e4 e5 2. Nf3 Nc6 1-0`;

const raw = (over: Partial<ChessComGame> = {}): ChessComGame => ({
  url: "https://www.chess.com/game/live/123456789",
  pgn: pgn("Cris won by resignation"),
  time_control: "600",
  end_time: 1_700_000_000,
  rated: true,
  white: { username: "Cris", rating: 1200, result: "win" },
  black: { username: "Rival", rating: 1300, result: "resigned" },
  ...over,
});

describe("parseGame", () => {
  it("derives color, result, ratings, opening and id for the white player", () => {
    const g = parseGame(raw(), "cris")!;
    expect(g.played_as).toBe("white");
    expect(g.result).toBe("win");
    expect(g.white_rating).toBe(1200);
    expect(g.black_rating).toBe(1300);
    expect(g.opening).toBe("Italian Game Giuoco Piano");
    expect(g.chess_game_id).toBe("123456789");
    expect(g.ended_by_abandonment).toBe(false);
  });
  it("matches the username case-insensitively and picks black when the user plays black", () => {
    const g = parseGame(raw({ white: { username: "Other", rating: 900, result: "resigned" }, black: { username: "CRIS", rating: 1000, result: "win" } }), "cris")!;
    expect(g.played_as).toBe("black");
    expect(g.result).toBe("win");
  });
  it("turns end_time (seconds) into an ISO timestamp", () => {
    expect(parseGame(raw(), "cris")!.played_at).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });
});

describe("parseGames", () => {
  it("drops games that fail to parse instead of throwing", () => {
    const bad = { ...raw(), white: undefined } as unknown as ChessComGame;
    expect(parseGames([raw(), bad], "cris")).toHaveLength(1);
  });
});

describe("endedByAbandonment", () => {
  it("detects abandonment in the Termination header only", () => {
    expect(endedByAbandonment(pgn("Rival won - game abandoned"))).toBe(true);
    expect(endedByAbandonment(pgn("Cris won by resignation"))).toBe(false);
  });
});
