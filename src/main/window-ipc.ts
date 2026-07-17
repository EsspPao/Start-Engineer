import { ipcMain } from "electron";
import type { AppEntry, AppMetrics, FocusWindowHints, WindowAction } from "../shared/types.js";
import { AppWindowManager } from "./window-manager.js";

type WindowTarget = {
  minimize: () => void;
  maximize: () => void;
  unmaximize: () => void;
  isMaximized: () => boolean;
  close: () => void;
};

type WindowIpcOptions = {
  getApp: (id: string) => AppEntry | undefined;
  manager: AppWindowManager;
  metricsFromHints: (appId: string, hints?: FocusWindowHints) => AppMetrics | undefined;
  getMainWindow: () => WindowTarget | null;
};

export function registerWindowIpc(options: WindowIpcOptions) {
  const resolve = (id: string, hints?: FocusWindowHints) => {
    const entry = options.getApp(id);
    if (!entry) throw new Error("未找到该应用配置。");
    return { entry, metrics: options.metricsFromHints(entry.id, hints) };
  };
  ipcMain.handle("apps:focusWindow", (_event, id: string, hints?: FocusWindowHints) => {
    const { entry, metrics } = resolve(id, hints);
    return options.manager.focusAppWindow(entry, metrics);
  });
  ipcMain.handle("apps:focusWindowHandle", (_event, id: string, handle: number, hints?: FocusWindowHints) => {
    const { entry, metrics } = resolve(id, hints);
    return options.manager.focusHandle(entry, handle, metrics);
  });
  ipcMain.handle("apps:listWindows", (_event, id: string, hints?: FocusWindowHints) => {
    const { entry, metrics } = resolve(id, hints);
    return options.manager.listWindows(entry, metrics);
  });
  ipcMain.handle("apps:windowDiagnostics", (_event, id: string, hints?: FocusWindowHints) => {
    const { entry, metrics } = resolve(id, hints);
    return options.manager.diagnostics(entry, metrics);
  });
  ipcMain.handle("window:action", (_event, action: WindowAction) => {
    const window = options.getMainWindow();
    if (!window) return;
    if (action === "minimize") window.minimize();
    else if (action === "maximize") window.isMaximized() ? window.unmaximize() : window.maximize();
    else window.close();
  });
}
