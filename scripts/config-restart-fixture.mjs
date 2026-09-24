import { app, BrowserWindow, dialog } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
app.setPath("appData", process.env.SE_ACCEPTANCE_PROFILE);
dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await import("../dist-electron/main/main.js");
void app.whenReady().then(async () => {
 try {
  let win;
  for(let n=0;n<100;n++){ win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')); if(win && await win.webContents.executeJavaScript('Boolean(window.startEngineer)')) break; await pause(100); }
  assert(win);
  const js=(code)=>win.webContents.executeJavaScript(code);
  if(process.env.SE_ACCEPTANCE_PHASE==='prepare') {
   await js(`(async()=>{ const api=window.startEngineer; const backup=await api.createConfigBackup(); await api.createGroup({name:'Later change',icon:'grid'}); await api.restoreConfigBackup(backup.id); })()`);
  } else {
   const groups=await js('window.startEngineer.listGroups()');
   assert(groups.some(g=>g.name==='Original group'));
   assert(!groups.some(g=>g.name==='Later change'));
   const backups=await js('window.startEngineer.listConfigBackups()');
   assert(backups.some(b=>b.reason==='恢复前备份'));
   assert(backups.some(b=>b.reason==='升级前自动备份'));
   assert(!existsSync(join(process.env.SE_ACCEPTANCE_PROFILE,'start-engineer','pending-restore.json')));
   console.log('Actual restart restore passed: original group restored, later change removed, upgrade and safety backups retained.');
   app.quit();
  }
 } catch(error) { console.error(error); app.exit(1); }
});
