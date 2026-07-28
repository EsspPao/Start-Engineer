import type { AppInfo } from "../shared/types";

export function formatAppDiagnostics(info: AppInfo) {
  return [
    `Start Engineer ${info.version}`,
    `Windows: ${info.systemVersion} (${info.arch})`,
    `Electron: ${info.electronVersion}`,
    `Chrome: ${info.chromeVersion}`,
    `Node.js: ${info.nodeVersion}`,
    `Packaged: ${info.isPackaged ? "yes" : "no"}`,
    `Data directory: ${info.userDataPath}`
  ].join("\n");
}
