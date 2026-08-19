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
  if (result.success || result.focused) return "";
  if (result.reason === "tray-restore-unsupported") return "应用已隐藏到系统托盘，请手动从托盘打开";
  if (result.reason === "focus-blocked-by-windows") return "窗口已找到，但 Windows 阻止了前台切换，可从任务栏点开";
  if (result.reason === "self-launch-not-allowed") return "当前唤醒策略不允许重新运行应用";
  if (result.reason === "self-launch-failed") return "重新运行应用后仍未能唤醒窗口";
  if (result.reason === "aumid-activation-failed") return "Windows 应用身份激活失败";
  if (result.reason === "app-not-running") return "应用当前未运行";
  if (result.reason === "restored-but-not-interactive") return "应用已响应，但未出现可交互窗口";
  if (result.reason === "stale-request") return "已忽略过期的唤醒请求";
  return "未找到可交互窗口";
}
