import type { AppEntry, AppMetrics, FocusAppWindowResult, FocusWindowHints } from "../shared/types";

export type RuntimeApp = AppEntry & { metrics: AppMetrics };

export function focusHintsForApp(app: RuntimeApp): FocusWindowHints {
  return {
    pids: app.metrics.pids,
    matchedPids: app.metrics.matchedPids,
    associatedPids: app.metrics.associatedPids,
    matchedProcessNames: app.metrics.matchedProcessNames,
    matchedPaths: app.metrics.matchedPaths
  };
}

export function focusResultMessage(result: FocusAppWindowResult) {
  if (result.focused) return "";
  if (result.reason === "tray-hidden") return "应用仍在托盘运行，请从托盘图标打开";
  if (result.reason === "trayIconNotFound") return "应用可能在托盘中";
  if (result.reason === "trayRestoreUnsupported") return "微信可能在托盘中，暂不支持直接恢复";
  if (["trayRestoreFailed", "suspectedWrongWindow", "restoredButNotInteractive", "fallbackRelaunchDisabled"].includes(result.reason ?? "")) return "未能正常恢复应用窗口";
  if (result.reason === "foreground-blocked") return "窗口已找到，但 Windows 阻止了前台切换，可从任务栏点开";
  return "未找到可唤起窗口";
}
