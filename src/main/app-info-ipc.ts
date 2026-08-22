import { ipcMain } from "electron";
import type { AppInfo, StartupViewCache } from "../shared/types.js";

type AppInfoIpcOptions = {
  getAppInfo: () => AppInfo;
  openUserDataDirectory: () => Promise<void>;
  openProjectHomepage: () => Promise<void>;
  getStartupViewCache: () => StartupViewCache | null;
  saveStartupViewCache: (cache: StartupViewCache) => void;
  markStartupPerformance: (name: string) => void;
};

export function registerAppInfoIpc(options: AppInfoIpcOptions) {
  ipcMain.handle("app:getInfo", () => options.getAppInfo());
  ipcMain.handle("app:openUserDataDirectory", () => options.openUserDataDirectory());
  ipcMain.handle("app:openProjectHomepage", () => options.openProjectHomepage());
  ipcMain.handle("startup:getViewCache", () => options.getStartupViewCache());
  ipcMain.handle("startup:saveViewCache", (_event, cache: StartupViewCache) => options.saveStartupViewCache(cache));
  ipcMain.handle("startup:markPerformance", (_event, name: string) => options.markStartupPerformance(name));
}
