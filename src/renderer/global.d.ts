import type { CommandDeckApi } from "../shared/types";

declare global {
  interface Window {
    commandDeck: CommandDeckApi;
  }
}

export {};
