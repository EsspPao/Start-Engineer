// Run with node_modules/.bin/electron scripts/verify-sidebar-drag.mjs; uses an isolated temporary profile.
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "start-engineer-drag-test-"));
app.setPath("appData", root);
const profile = join(root, "start-engineer");
mkdirSync(profile);
writeFileSync(join(profile, "preferences.json"), JSON.stringify({ closeBehavior: "quit", firstRunImportCompleted: true, globalShortcutEnabled: false, uiLayout: { uiScale: 125 } }));
writeFileSync(join(profile, "apps.json"), JSON.stringify([{ id: "drag-test", name: "Drag test", executablePath: "C:\\drag-test.exe", processName: "drag-test.exe", category: "games", groupId: "games", accent: "#5865f2" }]));
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await import("../dist-electron/main/main.js");
void app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 150; i++) {
      win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("/dist/index.html"));
      if (win && await win.webContents.executeJavaScript("Boolean(document.querySelector('[data-app-card-id=\"drag-test\"]'))")) break;
      await pause(100);
    }
    assert(win, "Test window missing");
    win.show(); win.focus(); await pause(3000);
    const rect = selector => win.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)}; })()`);
    const from = await rect('.unified-content [data-app-card-id="drag-test"]');
    const to = await rect('[data-drop-group="office"]');
    win.webContents.sendInputEvent({ type: "mouseMove", ...from });
    win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...from });
    win.webContents.sendInputEvent({ type: "mouseMove", modifiers: ["leftButtonDown"], x: from.x - 20, y: from.y });
    await pause(100);
    win.webContents.sendInputEvent({ type: "mouseMove", modifiers: ["leftButtonDown"], ...to });
    await pause(200);
    const state = await win.webContents.executeJavaScript(`(() => { const preview = document.querySelector('.app-card-drag-preview'); const sidebar = document.querySelector('.app-shell > .sidebar'); return {left: preview?.getBoundingClientRect().left, right: sidebar.getBoundingClientRect().right, target: document.querySelector('[data-drop-group="office"]').classList.contains('drop-active')}; })()`);
    assert(state.left >= state.right + 10, "Preview must not cover sidebar labels: " + JSON.stringify(state));
    assert(state.target, "Target group must remain highlighted");
    win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...to });
    await pause(600);
    assert.equal(JSON.parse(readFileSync(join(profile, "apps.json"), "utf8"))[0].groupId, "office");
    console.log("Sidebar drag verified at 125%: labels unobstructed, target highlighted, drop persisted.");
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { BrowserWindow.getAllWindows().forEach(w => w.destroy()); app.exit(process.exitCode || 0); }
});
