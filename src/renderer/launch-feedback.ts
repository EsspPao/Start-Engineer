import type { LaunchAppResult } from "../shared/types";

export type LaunchFeedbackState = "starting" | LaunchAppResult["status"];

export function buildLaunchFeedbackMessage(state: LaunchFeedbackState, appName: string) {
  switch (state) {
    case "starting":
      return `正在启动「${appName}」...`;
    case "launched":
      return `已启动「${appName}」`;
    case "alreadyRunning":
      return `「${appName}」已在运行`;
    case "cancelled":
      return `已取消启动「${appName}」`;
    case "failed":
      return `「${appName}」启动失败`;
  }
}
