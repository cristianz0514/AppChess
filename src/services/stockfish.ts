import { type ChildProcess, spawn } from "child_process";
import path from "path";

const STOCKFISH_PATH = path.join(
  process.cwd(),
  "node_modules/stockfish/src/stockfish.js"
);

interface EvalResult {
  score: number;
  mate: number | null;
}

export async function evaluatePosition(fen: string, depth = 12): Promise<EvalResult> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn("node", [STOCKFISH_PATH], { stdio: "pipe" });

    let output = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("Stockfish timeout"));
    }, 8000);

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      const lines = output.split("\n");

      for (const line of lines) {
        if (line.startsWith(`info depth ${depth}`) && line.includes("score")) {
          const mateMatch = line.match(/score mate (-?\d+)/);
          const cpMatch = line.match(/score cp (-?\d+)/);

          if (mateMatch) {
            clearTimeout(timeout);
            proc.kill();
            resolve({ score: mateMatch[1].startsWith("-") ? -9999 : 9999, mate: parseInt(mateMatch[1]) });
            return;
          }
          if (cpMatch) {
            clearTimeout(timeout);
            proc.kill();
            resolve({ score: parseInt(cpMatch[1]) / 100, mate: null });
            return;
          }
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.stdin?.write("uci\n");
    proc.stdin?.write(`position fen ${fen}\n`);
    proc.stdin?.write(`go depth ${depth}\n`);
  });
}
