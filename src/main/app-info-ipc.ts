import { ipcMain } from "electron";
import type { AppInfo } from "../shared/types.js";

type AppInfoIpcOptions = {
  getAppInfo: () => AppInfo;
  openUserDataDirectory: () => Promise<void>;
  openProjectHomepage: () => Promise<void>;
};

export function registerAppInfoIpc(options: AppInfoIpcOptions) {
  ipcMain.handle("app:getInfo", () => options.getAppInfo());
  ipcMain.handle("app:openUserDataDirectory", () => options.openUserDataDirectory());
  ipcMain.handle("app:openProjectHomepage", () => options.openProjectHomepage());
}
