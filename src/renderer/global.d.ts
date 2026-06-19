import type { CommandDeckApi, StartEngineerApi } from "../shared/types";

declare global {
  interface Window {
    startEngineer: StartEngineerApi;
    commandDeck: CommandDeckApi;
  }
}

export {};
