import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const handlerFiles = ["ipc.ts", "runtime-ipc.ts", "search-ipc.ts", "preferences-ipc.ts", "window-ipc.ts"];
const read = (path: string) => readFileSync(join(root, path), "utf8");
const channels = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map((match) => match[1]);

describe("IPC contract", () => {
  it("registers every preload invoke exactly once", () => {
    const handled = handlerFiles.flatMap((file) => channels(read(`src/main/${file}`), /ipcMain\.handle\("([^"]+)"/g));
    const invoked = channels(read("src/preload/preload.cts"), /ipcRenderer\.invoke\("([^"]+)"/g);
    expect(new Set(handled).size).toBe(handled.length);
    expect([...new Set(handled)].sort()).toEqual([...new Set(invoked)].sort());
  });

  it("keeps main-to-renderer event channels paired", () => {
    const mainSources = ["src/main/main.ts", "src/main/app-window-service.ts"].map(read).join("\n");
    const sent = channels(mainSources, /\.send\("([^"]+)"/g);
    const listened = channels(read("src/preload/preload.cts"), /ipcRenderer\.on\("([^"]+)"/g);
    expect([...new Set(sent)].sort()).toEqual([...new Set(listened)].sort());
  });
});
