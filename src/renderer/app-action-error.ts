import type { AppActionDomain, AppActionFailure, AppEntry, FocusAppWindowResult, LaunchAppResult } from "../shared/types";

const technicalMessage = (reason: unknown) => reason instanceof Error
  ? reason.message
  : typeof reason === "string" ? reason : undefined;

export function launchActionFailure(
  result: Pick<LaunchAppResult, "status" | "errorCode" | "message">,
  app?: Pick<AppEntry, "appUserModelId">,
): AppActionFailure | null {
  if (result.status === "launched" || result.status === "alreadyRunning") return null;
  if (result.status === "cancelled" || result.errorCode === 1223) {
    return { domain: "launch", code: "elevation-cancelled", retryable: true, diagnostics: { nativeErrorCode: result.errorCode } };
  }
  const diagnostics = { technicalMessage: result.message, nativeErrorCode: result.errorCode };
  if (app?.appUserModelId && result.errorCode === 1168) return { domain: "launch", code: "store-registration-missing", retryable: false, diagnostics };
  if (!app?.appUserModelId && (result.errorCode === 2 || result.errorCode === 3 || /路径|不存在/.test(result.message ?? ""))) {
    return { domain: "launch", code: "executable-missing", retryable: false, diagnostics };
  }
  if (result.errorCode === 267) return { domain: "launch", code: "working-directory-invalid", retryable: false, diagnostics };
  if (result.errorCode === 5 || result.errorCode === 740) return { domain: "launch", code: "permission-denied", retryable: true, diagnostics };
  if (/服务暂时无响应/.test(result.message ?? "")) return { domain: "launch", code: "service-unavailable", retryable: true, diagnostics };
  return { domain: "launch", code: "operation-failed", retryable: true, diagnostics };
}

export function wakeActionFailure(result: FocusAppWindowResult): AppActionFailure | null {
  if (result.success || result.focused || result.outcome === "activation-requested") return null;
  const code = result.reason === "tray-restore-unsupported"
    ? "tray-restore-unsupported"
    : result.reason === "focus-blocked-by-windows"
      ? "focus-blocked-by-windows"
      : result.reason === "stale-request"
        ? "stale-request"
        : result.reason === "no-interactive-window" || result.reason === "app-not-running" || result.reason === "restored-but-not-interactive"
          ? "no-interactive-window"
          : result.reason === "self-launch-failed" || result.reason === "aumid-activation-failed" || result.reason === "self-launch-not-allowed"
            ? "activation-failed"
            : "operation-failed";
  return {
    domain: "wake",
    code,
    retryable: code !== "tray-restore-unsupported" && code !== "stale-request",
    diagnostics: { wakeReason: result.reason },
  };
}

export function exceptionActionFailure(domain: AppActionDomain, reason: unknown): AppActionFailure {
  const detail = technicalMessage(reason);
  const code = detail && /取消管理员授权|ELEVATION_CANCELLED/i.test(detail)
    ? "elevation-cancelled"
    : detail && /权限|授权|access.*denied/i.test(detail)
      ? "permission-denied"
      : detail && /暂时无响应|timeout|timed out/i.test(detail)
        ? "service-unavailable"
        : "operation-failed";
  return { domain, code, retryable: true, diagnostics: { technicalMessage: detail } };
}

export function appActionFailureMessage(failure: AppActionFailure) {
  if (failure.code === "app-not-found") return "未找到该应用配置";
  if (failure.code === "executable-missing") return "程序路径不存在，请重新选择启动程序";
  if (failure.code === "working-directory-invalid") return "应用的工作目录无效，请检查启动配置";
  if (failure.code === "permission-denied") return "当前操作需要更高权限，请按 Windows 提示授权后重试";
  if (failure.code === "elevation-cancelled") return "已取消 Windows 授权，操作未执行";
  if (failure.code === "store-registration-missing") return "未找到对应的 Windows 应用，请确认它仍已安装";
  if (failure.code === "service-unavailable") return "应用服务暂时无响应，请稍后重试";
  if (failure.code === "tray-restore-unsupported") return "应用已隐藏到系统托盘，请手动从托盘打开";
  if (failure.code === "focus-blocked-by-windows") return "窗口已找到，但 Windows 阻止了前台切换，可从任务栏点开";
  if (failure.code === "no-interactive-window") {
    if (failure.diagnostics?.wakeReason === "app-not-running") return "应用当前未运行";
    if (failure.diagnostics?.wakeReason === "restored-but-not-interactive") return "应用已响应，但未出现可交互窗口";
    return "未找到可交互窗口";
  }
  if (failure.code === "activation-failed") {
    if (failure.diagnostics?.wakeReason === "self-launch-not-allowed") return "当前唤醒策略不允许重新运行应用";
    if (failure.diagnostics?.wakeReason === "self-launch-failed") return "重新运行应用后仍未能唤醒窗口";
    if (failure.diagnostics?.wakeReason === "aumid-activation-failed") return "Windows 应用身份激活失败";
    return "应用已响应，但未能唤起可交互窗口";
  }
  if (failure.code === "stale-request") return "已忽略过期的操作请求";
  if (failure.domain === "close") return "结束应用失败，请刷新状态后重试";
  if (failure.domain === "runtime") return "资源监控刷新失败，请稍后重试";
  if (failure.domain === "wake") return "唤起应用窗口失败";
  return "启动失败，请检查应用配置后重试";
}
