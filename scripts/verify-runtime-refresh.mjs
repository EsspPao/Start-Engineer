// Run with node_modules/.bin/electron scripts/verify-runtime-refresh.mjs.
// Isolated profile and simulated game status: never launches or closes a user's game.
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "start-engineer-runtime-test-"));
app.setPath("appData", root);
const profile = join(root, "start-engineer");
mkdirSync(profile);
const entry = { id: "game-test", name: "Wuthering Waves", processName: "Wuthering Waves", executablePath: "C:\\Test\\Wuthering Waves.exe", groupId: "games", category: "游戏", accent: "#2563eb" };
writeFileSync(join(profile, "preferences.json"), JSON.stringify({ closeBehavior: "quit", firstRunImportCompleted: true, globalShortcutEnabled: false }));
writeFileSync(join(profile, "apps.json"), JSON.stringify([entry]));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await import("../dist-electron/main/main.js");
void app.whenReady().then(async () => {
  try {
    let win;
    for (let n = 0; n < 150; n++) {
      win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("/dist/index.html"));
      if (win && await win.webContents.executeJavaScript("Boolean(document.querySelector('.searchbar'))")) break;
      await pause(100);
    }
    assert(win);
    const js = (code) => win.webContents.executeJavaScript(code);
    const waitFor = async (check, timeout = 2500) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { if (await check()) return; await pause(30); }
      throw new Error("Runtime state did not update within " + timeout + " ms");
    };
    let running = true;
    let hold = false;
    let release;
    let forced = 0;
    ipcMain.removeHandler("runtime:snapshot");
    ipcMain.handle("runtime:snapshot", async (_event, _mode, force) => {
      if (force) forced++;
      const snapshot = { apps: [entry], processes: [], metrics: [{ appId: entry.id, isRunning: running, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: running ? [42] : [], matchedPids: running ? [42] : [], associatedPids: [], matchedProcessNames: [], matchedPaths: [] }] };
      if (hold) { hold = false; await new Promise((resolve) => { release = resolve; }); }
      return snapshot;
    });
    const lit = () => js("Boolean(document.querySelector('.running-dot'))");
    await js("window.dispatchEvent(new Event('focus'))");
    await waitFor(lit);
    // Even after a long game session, a visible launcher must not back off to six seconds.
    await js("void (Date.now = ((original) => () => original() + 61000)(Date.now))");
    await pause(1200);
    running = false;
    await waitFor(async () => !(await lit()), 1800);
    running = true;
    await js("window.dispatchEvent(new Event('focus'))");
    await waitFor(lit);
    // Return while an old snapshot is in flight: immediately follow it with a forced snapshot.
    hold = true;
    await waitFor(() => Boolean(release));
    running = false;
    const before = forced;
    await js("window.dispatchEvent(new Event('focus'))");
    release();
    await waitFor(async () => !(await lit()), 700);
    assert(forced > before, "Returning during an in-flight request must queue a forced refresh");
    console.log("Runtime refresh passed: idle visible exit <= 1.8s; in-flight return <= 0.7s; no game was launched or terminated.");
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
