export function cleanErrorMessage(reason: unknown, fallback = "操作失败") {
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : fallback;
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (/taskkill exited with code|CategoryInfo|FullyQualifiedErrorId|RuntimeException/i.test(cleaned)) {
    if (/管理员结束进程失败/.test(cleaned)) {
      return "管理员结束进程失败：部分进程未能结束，请稍后刷新状态后重试。";
    }
    return "结束进程失败：部分进程未能结束，请稍后刷新状态后重试。";
  }

  return cleaned || fallback;
}
