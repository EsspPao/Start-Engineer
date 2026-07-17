import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonConfigStore } from "./config-store";

describe("JsonConfigStore", () => {
  it("normalizes, caches, and persists values", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-config-"));
    const path = join(root, "value.json");
    const store = new JsonConfigStore<number>({ path: () => path, normalize: (raw) => Math.max(0, Number(raw) || 0), fallback: () => 3 });
    expect(store.load()).toBe(3);
    expect(store.save(-5)).toBe(0);
    expect(JSON.parse(readFileSync(path, "utf8"))).toBe(0);
  });

  it("backs up corrupt files before restoring defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-config-"));
    const path = join(root, "value.json");
    writeFileSync(path, "not-json", "utf8");
    const store = new JsonConfigStore({ path: () => path, normalize: (raw) => raw as string[], fallback: () => ["default"] });
    expect(store.load()).toEqual(["default"]);
    expect(existsSync(path)).toBe(true);
  });
});
