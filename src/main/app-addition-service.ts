import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { AddDroppedExecutablesResult, AppEntry, AppGroup } from "../shared/types.js";
import { addDroppedExecutablesToApps, type DroppedAppTarget } from "./dropped-apps.js";

type AppAdditionServiceOptions = {
  getMainWindow: () => BrowserWindow | null;
  getGroups: () => AppGroup[];
  loadApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[] | void;
  getApp: (id: string) => AppEntry | undefined;
  validGroupId: (groupId?: string) => string;
  cacheIcon: (entry: AppEntry) => Promise<AppEntry>;
  exists?: (path: string) => boolean;
  createId?: () => string;
  chooseExecutable?: (title: string) => Promise<string | undefined>;
  resolveShortcut?: (filePath: string) => Promise<DroppedAppTarget | null>;
};

export class AppAdditionService {
  constructor(private readonly options: AppAdditionServiceOptions) {}

  async addFromDialog(groupId?: string) {
    const filePath = await this.chooseExecutable("选择要加入 Start Engineer 的程序");
    if (!filePath) return this.options.loadApps();
    return (await this.addDroppedExecutables([filePath], groupId)).apps;
  }

  async pickExecutable(id: string) {
    if (!this.options.getApp(id)) throw new Error("未找到该应用配置。");
    return this.chooseExecutable("选择应用启动程序");
  }

  async addDroppedExecutables(filePaths: string[], groupId?: string): Promise<AddDroppedExecutablesResult> {
    const result = await addDroppedExecutablesToApps({
      filePaths,
      groupId: this.options.validGroupId(groupId),
      groups: this.options.getGroups(),
      apps: this.options.loadApps(),
      exists: this.options.exists ?? existsSync,
      createId: this.options.createId ?? randomUUID,
      cacheAppIcon: this.options.cacheIcon,
      resolveDroppedPath: (filePath) => this.resolveDroppedPath(filePath)
    });
    if (result.addedAppIds.length) this.options.saveApps(result.apps);
    return result;
  }

  private chooseExecutable(title: string) {
    if (this.options.chooseExecutable) return this.options.chooseExecutable(title);
    const dialogOptions: OpenDialogOptions = {
      title,
      filters: [{ name: "Windows 程序", extensions: ["exe"] }],
      properties: ["openFile"]
    };
    const mainWindow = this.options.getMainWindow();
    return (mainWindow ? dialog.showOpenDialog(mainWindow, dialogOptions) : dialog.showOpenDialog(dialogOptions))
      .then((result) => result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0]);
  }

  private resolveDroppedPath(filePath: string): Promise<DroppedAppTarget | null> {
    const extension = extname(filePath).toLowerCase();
    if (extension === ".exe") return Promise.resolve({ executablePath: filePath });
    if (extension === ".lnk" && this.options.resolveShortcut) return this.options.resolveShortcut(filePath);
    return Promise.resolve(null);
  }
}
