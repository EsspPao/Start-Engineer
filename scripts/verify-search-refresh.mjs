// Run with node_modules/.bin/electron scripts/verify-search-refresh.mjs.
// Uses an isolated profile and simulated installation results, never installs software.
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "start-engineer-search-test-"));
app.setPath("appData", root);
const profile = join(root, "start-engineer");
mkdirSync(profile);
writeFileSync(join(profile, "preferences.json"), JSON.stringify({ closeBehavior: "quit", firstRunImportCompleted: true, globalShortcutEnabled: false }));
writeFileSync(join(profile, "apps.json"), "[]");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await import("../dist-electron/main/main.js");

void app.whenReady().then(async () => {
  try {
    let win;
    for (let attempt = 0; attempt < 150; attempt++) {
      win = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("/dist/index.html"));
      if (win && await win.webContents.executeJavaScript("Boolean(document.querySelector('.searchbar input'))")) break;
      await pause(100);
    }
    assert(win, "Search test window missing");
    let installed = false;
    let searches = 0;
    ipcMain.removeHandler("apps:searchCandidates");
    ipcMain.removeHandler("apps:searchInstallable");
    ipcMain.handle("apps:searchCandidates", () => {
      searches++;
      return installed ? [{ id: "test-uu", name: "UU加速器", executablePath: process.execPath, processName: "uu_launcher", source: "start-menu", groupId: "games", category: "游戏" }] : [];
    });
    ipcMain.handle("apps:searchInstallable", () => installed ? [] : [{ id: "uu-accelerator", name: "UU加速器", publisher: "网易", aliases: ["uu"], category: "game", source: "official", action: "open-download-page", downloadPage: "https://uu.163.com/download/" }]);
    win.show();
    win.focus();
    const js = (code) => win.webContents.executeJavaScript(code);
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await js(expression)) return;
        await pause(100);
      }
      throw new Error("Timed out: " + expression);
    };
    await js(`(() => { const input = document.querySelector('.searchbar input'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'uu'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor("document.querySelector('.search-results-panel')?.innerText.includes('官方下载页')");
    const other = new BrowserWindow({ width: 240, height: 160, show: false });
    await other.loadURL("about:blank");
    other.show(); other.focus();
    await pause(300);
    installed = true;
    win.focus();
    await waitFor("document.querySelector('.search-results-panel')?.innerText.includes('本机可添加应用') && !document.querySelector('.search-results-panel')?.innerText.includes('官方下载页')");
    assert.equal(await js("document.querySelector('.searchbar input').value"), "uu");
    installed = false;
    await js("document.querySelector('.searchbar input').blur(); document.querySelector('.searchbar input').focus();");
    await waitFor("document.querySelector('.search-results-panel')?.innerText.includes('官方下载页') && !document.querySelector('.search-results-panel')?.innerText.includes('本机可添加应用')");
    assert(searches >= 3);
    console.log("Search refresh verified: unchanged query refreshes on window return and input refocus, switching installed/download sections.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    BrowserWindow.getAllWindows().forEach((win) => win.destroy());
    app.exit(process.exitCode || 0);
  }
});
