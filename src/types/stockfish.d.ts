// The `stockfish` npm package ships no type declarations.
// Its default export is an initializer: initEngine(path?) => Promise<engine>.
declare module "stockfish" {
  interface StockfishEngineModule {
    sendCommand: (cmd: string) => void;
    listener: ((line: string) => void) | null;
    terminate?: () => void;
    [key: string]: unknown;
  }
  const initEngine: (enginePath?: string) => Promise<StockfishEngineModule>;
  export default initEngine;
}
