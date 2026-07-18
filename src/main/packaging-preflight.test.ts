import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows packaging preflight", () => {
  it("checks and closes Start Engineer before packaging", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const script = readFileSync(join(process.cwd(), "scripts/close-running-app.mjs"), "utf8");
    expect(packageJson.scripts["prepackage:win"]).toBe("node scripts/close-running-app.mjs");
    expect(script).toContain("tasklist.exe");
    expect(script).toContain("Get-Process -Name 'Start Engineer'");
    expect(script).toContain("taskkill.exe");
    expect(script).toContain('"/PID"');
    expect(script).toContain("Start Engineer.exe");
    expect(script).toContain("-Verb RunAs");
  });
});
