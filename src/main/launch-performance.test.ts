import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/main/main.ts"), "utf8");

describe("fast application launch", () => {
  it("uses the lightweight task list before launch and learns child processes in the background", () => {
    const launchStart = source.indexOf("async function launchConfiguredApp");
    const launchEnd = source.indexOf("async function terminateManagedApps", launchStart);
    const launchSource = source.slice(launchStart, launchEnd);

    expect(launchSource).toContain("getManagedRunningStatus()");
    expect(launchSource).not.toContain("metricsSnapshot()");
    expect(launchSource).toContain("saveLaunchedPidAndTrack(id, launchResult.pid, options.waitForAssociation === true)");
    expect(source).toContain('ipcMain.handle("apps:launch", (_event, id: string) => launchConfiguredApp(id))');
    expect(source).toContain("(entry) => launchConfiguredApp(entry.id)");
  });
});
