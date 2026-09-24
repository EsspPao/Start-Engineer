import type { AppInfo } from "../shared/types.js";
export function feedbackUrl(info: AppInfo) {
  const body = ["### 遇到的问题", "请描述实际结果和期望结果。", "", "### 复现步骤", "1. ", "2. ", "", "### 涉及的应用", "请填写应用名称和版本（不要填写个人路径）。", "", "### 运行环境", `Start Engineer: ${info.version}`, `Build: ${info.buildId ?? "unknown"}`, `Windows: ${info.systemVersion} (${info.arch})`, `Packaged: ${info.isPackaged}`, "", "### 截图或补充信息", "提交前请检查截图和文本，隐藏个人信息。"].join("\n");
  return "https://github.com/EsspPao/Start-Engineer/issues/new?" + new URLSearchParams({ title: "[问题反馈] ", body }).toString();
}
