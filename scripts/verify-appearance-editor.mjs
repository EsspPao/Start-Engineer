// Run with: node_modules/.bin/electron scripts/verify-appearance-editor.mjs
// Uses a temporary profile; never loads the user's apps or preferences.
import { app, BrowserWindow, screen } from "electron";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "start-engineer-appearance-test-"));
app.setPath("appData", root);
const profile = join(root, "start-engineer");
mkdirSync(profile);
writeFileSync(join(profile, "preferences.json"), JSON.stringify({ closeBehavior: "quit", globalShortcutEnabled: false, firstRunImportCompleted: true }));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 25000;
let mainWindow;
await import("../dist-electron/main/main.js");
void app.whenReady().then(async () => {
try {
  while (Date.now() < deadline) {
    mainWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("/dist/index.html"));
    if (mainWindow && await mainWindow.webContents.executeJavaScript("Boolean(document.querySelector('.nav-button.settings'))")) break;
    await pause(100);
  }
  assert(mainWindow, "Production window did not load");
  const bounds = mainWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  // Windows may add a two-DIP frame to transparent window bounds.
  assert(Math.abs(bounds.width - Math.min(1440, Math.floor(area.width * 0.9))) <= 2);
  assert(Math.abs(bounds.height - Math.min(800, Math.floor(area.height * 0.9))) <= 2);
  assert(bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height, "Startup window must fit its display");
  const report = await mainWindow.webContents.executeJavaScript(`(async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 120));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const button = (text) => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
    const click = async text => { const el = button(text); check(el && !el.disabled, 'Missing enabled control: ' + text); el.click(); await wait(); };
    document.querySelector('.nav-button.settings').click(); await wait();
    await click('自定义与分享');
    check(document.querySelector('dialog[open]'), 'Editor should be modal');
    const themeButton = [...document.querySelectorAll('.studio-themes button')].find(el => el.textContent.includes('Midnight Control'));
    themeButton.click(); await wait();
    check(document.documentElement.dataset.theme === 'apple', 'Draft must not change live theme');
    check(document.querySelector('.studio-preview-surface').dataset.theme === 'midnight', 'Preview must reflect draft');
    const shadow = document.querySelector('.studio-preview-surface').shadowRoot;
    check(shadow.querySelectorAll('.app-card').length === 6, 'Preview should render actual cards');
    await click('撤销'); check(document.querySelector('.studio-preview-surface').dataset.theme === 'apple', 'Undo failed');
    await click('重做'); check(document.querySelector('.studio-preview-surface').dataset.theme === 'midnight', 'Redo failed');
    await click('取消'); check(!document.querySelector('dialog'), 'Cancel should close');
    check(document.documentElement.dataset.theme === 'apple', 'Cancel should preserve theme');
    await click('自定义与分享'); await click('分享');
    const textarea = document.querySelector('.studio-field textarea');
    const setText = value => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value); textarea.dispatchEvent(new Event('input', { bubbles: true })); };
    setText('seui:v2:broken'); await wait(); await click('导入并预览');
    check(document.querySelector('[role=status]').textContent.includes('损坏'), 'Invalid code should show error');
    const appearance = { uiTheme: 'midnight', wallpaperGlassIntensity: 77, wallpaperGlassVariant: 'light', uiLayout: { cardSize: 'small', uiScale: 105, showAppNames: true, showRunningStatus: false } };
    setText('seui:v2:' + btoa(encodeURIComponent(JSON.stringify(appearance)))); await wait(); await click('导入并预览');
    check(document.querySelector('.studio-preview-surface').dataset.theme === 'midnight', 'Import preview failed');
    check(document.documentElement.dataset.theme === 'apple', 'Import must remain a draft');
    window.dispatchEvent(new CustomEvent('start-engineer:group-navigation', { detail: 'next' })); await wait();
    check(document.querySelector('dialog[open]'), 'Native group navigation must not dismiss editor');
    await click('保存并应用'); check(!document.querySelector('dialog'), 'Save should close editor');
    check(document.documentElement.dataset.theme === 'midnight', 'Save must apply theme');
    await click('自定义与分享'); await click('布局'); await click('小屏幕');
    return { previewWidth: document.querySelector('.studio-preview-surface').offsetWidth, previewHeight: document.querySelector('.studio-preview-surface').offsetHeight };
  })()`);
  assert.deepEqual(report, { previewWidth: 1024, previewHeight: 600 });
  const point = await mainWindow.webContents.executeJavaScript(`(() => { const r = document.querySelector('.studio-preview-inspect').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  mainWindow.webContents.sendInputEvent({ type: "mouseMove", ...point });
  await pause(200);
  const hover = await mainWindow.webContents.executeJavaScript(`(() => { const el = document.querySelector('.studio-preview-inspect'); return { hovered: el.matches(':hover'), background: getComputedStyle(el).backgroundColor }; })()`);
  assert.equal(hover.hovered, true, "Pointer must actually hover over the preview");
  assert.equal(hover.background, "rgba(0, 0, 0, 0)", "Hover overlay must remain transparent so the preview stays visible");

  const persisted = JSON.parse(readFileSync(join(profile, "preferences.json"), "utf8"));
  assert.equal(persisted.uiTheme, "midnight");
  assert.equal(persisted.wallpaperGlassIntensity, 77);
  assert.equal(persisted.uiLayout.cardSize, "small");
  assert.equal(persisted.uiLayout.showRunningStatus, true);
  assert.equal(persisted.closeBehavior, "quit");
  mainWindow.setMinimumSize(640, 480);
  mainWindow.setSize(1024, 600);
  await pause(200);
  const fits = await mainWindow.webContents.executeJavaScript(`(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`);
  assert(fits, "Editor must fit a small window");
  if (process.env.START_ENGINEER_APPEARANCE_SCREENSHOT) {
    const screenshot = await mainWindow.webContents.capturePage();
    writeFileSync(process.env.START_ENGINEER_APPEARANCE_SCREENSHOT, screenshot.toPNG());
  }
  console.log("Appearance editor verified: preview, undo/redo, cancel, import errors, complete import/save, native shortcut isolation, and 1024x600 layout.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Destroy only windows belonging to this isolated test process.
  BrowserWindow.getAllWindows().forEach((window) => window.destroy());
  app.exit(process.exitCode || 0);
}

});
