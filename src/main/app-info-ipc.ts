import { ipcMain } from "electron";
import type { AppInfo, ConfigBackupSummary, StartupViewCache } from "../shared/types.js";

type AppInfoIpcOptions = {
  getAppInfo: () => AppInfo;
  openFeedback: () => Promise<void>;
  listConfigBackups: () => ConfigBackupSummary[];
  createConfigBackup: () => ConfigBackupSummary;
  restoreConfigBackup: (id: string) => Promise<boolean>;
  openUserDataDirectory: () => Promise<void>;
  openProjectHomepage: () => Promise<void>;
  getStartupViewCache: () => StartupViewCache | null;
  saveStartupViewCache: (cache: StartupViewCache) => void;
  markStartupPerformance: (name: string) => void;
};

export function registerAppInfoIpc(options: AppInfoIpcOptions) {
  ipcMain.handle("app:openFeedback", () => options.openFeedback());
  ipcMain.handle("config:listBackups", () => options.listConfigBackups());
  ipcMain.handle("config:createBackup", () => options.createConfigBackup());
  ipcMain.handle("config:restoreBackup", (_event, id: string) => options.restoreConfigBackup(id));
  ipcMain.handle("app:getInfo", () => options.getAppInfo());
  ipcMain.handle("app:openUserDataDirectory", () => options.openUserDataDirectory());
  ipcMain.handle("app:openProjectHomepage", () => options.openProjectHomepage());
  ipcMain.handle("startup:getViewCache", () => options.getStartupViewCache());
  ipcMain.handle("startup:saveViewCache", (_event, cache: StartupViewCache) => options.saveStartupViewCache(cache));
  ipcMain.handle("startup:markPerformance", (_event, name: string) => options.markStartupPerformance(name));
}
