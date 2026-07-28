import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEverythingDownloadPlan, getManagedEverythingPaths, getSearchDependencyStatus, verifyFileSha256 } from "./search-dependencies.js";

const existing = new Set<string>();
const exists = (path: string) => existing.has(path);

describe("search dependency management", () => {
  it("prefers configured ES.exe over system and managed copies", () => {
    existing.clear();
    existing.add("C:\\Configured\\ES.exe");
    existing.add("C:\\Program Files\\Everything\\ES.exe");
    const status = getSearchDependencyStatus({ everythingCliPath: "C:\\Configured\\ES.exe" }, "C:\\Data", { exists, pathEnv: "C:\\Program Files\\Everything" });

    expect(status).toMatchObject({ state: "ready", everythingCliPath: "C:\\Configured\\ES.exe" });
  });

  it("detects the managed portable dependency", () => {
    existing.clear();
    const paths = getManagedEverythingPaths("C:\\Data");
    existing.add(paths.everythingPath);
    existing.add(paths.everythingCliPath);

    expect(getSearchDependencyStatus({}, "C:\\Data", { exists })).toMatchObject({
      state: "ready",
      everythingPath: paths.everythingPath,
      everythingCliPath: paths.everythingCliPath
    });
  });

  it("builds download targets for official portable packages", () => {
    const plan = buildEverythingDownloadPlan("C:\\Data");

    expect(plan.everything.url).toBe("https://www.voidtools.com/Everything-1.4.1.1032.x64.zip");
    expect(plan.es.url).toBe("https://www.voidtools.com/ES-1.1.0.37.x64.zip");
    expect(plan.everything.sha256).toHaveLength(64);
    expect(plan.es.sha256).toHaveLength(64);
    expect(plan.everything.finalDir).toContain("dependencies\\everything");
    expect(plan.es.finalDir).toContain("dependencies\\everything");
  });

  it("rejects a dependency whose SHA-256 does not match", async () => {
    const directory = mkdtempSync(join(tmpdir(), "start-engineer-hash-"));
    const path = join(directory, "dependency.zip");
    writeFileSync(path, "trusted content");
    await expect(verifyFileSha256(path, "0".repeat(64))).rejects.toThrow("安全校验失败");
    rmSync(directory, { recursive: true, force: true });
  });
});
