import { app, BrowserWindow, dialog, shell } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "se-support-ui-"));
app.setPath("appData", root);
mkdirSync(join(root, "start-engineer"));
writeFileSync(join(root, "start-engineer/preferences.json"), JSON.stringify({ firstRunImportCompleted: true, globalShortcutEnabled: false, closeBehavior: "quit" }));
let opened = "";
shell.openExternal = async (url) => { opened = url; };
let confirmations = 0;
dialog.showMessageBox = async () => { confirmations++; return { response: 0, checkboxChecked: false }; };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await import("../dist-electron/main/main.js");
void app.whenReady().then(async () => {
 try {
  let win;
  for(let n=0;n<150;n++) { win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')); if(win && await win.webContents.executeJavaScript("Boolean(document.querySelector('.nav-button.settings'))")) break; await pause(100); }
  assert(win);
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (text) => js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(text)})?.click()`);
  const wait = async (code) => { for(let n=0;n<100;n++) { if(await js(code)) return; await pause(50); } throw new Error(code); };
  await js("document.querySelector('.nav-button.settings').click()");
  await wait("document.body.textContent.includes('配置备份与恢复')");
  await click("反馈问题"); await pause(150);
  const url = new URL(opened);
  assert.equal(url.pathname, '/EsspPao/Start-Engineer/issues/new');
  assert(url.searchParams.get('body').includes('Build:'));
  assert(!url.searchParams.get('body').includes(root));
  await click("立即备份"); await wait("document.body.textContent.includes('当前配置已备份')");
  await click("恢复备份"); await wait("document.body.textContent.includes('恢复这份备份')");
  await click("恢复这份备份"); await wait("document.body.textContent.includes('已取消恢复')");
  assert.equal(confirmations,1);
  for (const [width,height] of [[1440,800],[1024,600]]) {
    win.setSize(width,height); await pause(200);
    await js("document.getElementById('support-heading').scrollIntoView()");
    assert(await js("document.documentElement.scrollWidth <= innerWidth"), "No horizontal overflow");
    const shot=await win.webContents.capturePage(); writeFileSync(resolve(`node_modules/.cache/support-${width}.png`),shot.toPNG());
  }
  console.log("Support UI passed: isolated profile, feedback metadata privacy, manual backup, cancellation, 1440x800 and 1024x600.");
  app.quit();
 } catch(error) { console.error(error); app.exit(1); }
});
