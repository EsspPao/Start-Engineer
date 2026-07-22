export type DroppedFileLike = {
  name?: string;
};

export type DropAddSummary = {
  addedAppIds: string[];
  skippedPaths: string[];
};

export function droppedAppPaths<T extends DroppedFileLike>(files: T[], getPathForFile: (file: T) => string) {
  return files
    .map((file) => getPathForFile(file).trim())
    .filter((filePath) => filePath && /\.(exe|lnk)$/i.test(filePath));
}

export function targetDropGroupId(activeSection: string, appGroupIds: string[]) {
  return appGroupIds.includes(activeSection) ? activeSection : appGroupIds[0] ?? "";
}

export function dropNoticeForResult(result: DropAddSummary) {
  const added = result.addedAppIds.length;
  const skipped = result.skippedPaths.length;
  if (added && skipped) return `已添加 ${added} 个应用，已跳过 ${skipped} 个`;
  if (added) return `已添加 ${added} 个应用`;
  return "应用已存在或文件无效";
}
