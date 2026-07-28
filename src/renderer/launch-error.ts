import type { AppEntry, LaunchAppResult } from "../shared/types";

export function shouldOfferExecutableReplacement(
  app: Pick<AppEntry, "appUserModelId"> | undefined,
  result: Pick<LaunchAppResult, "errorCode" | "message">
) {
  if (app?.appUserModelId) return false;
  return result.errorCode === 2 || /路径|不存在/.test(result.message ?? "");
}
