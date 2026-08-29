import { useCallback, useRef, useState, type DragEvent } from "react";
import type { AppEntry, SectionId, StartEngineerApi } from "../shared/types";
import { cleanErrorMessage } from "./error-message";
import { droppedAppPaths, dropNoticeForResult, targetDropGroupId } from "./dropped-files";

type UseExecutableDropOptions = {
  client: StartEngineerApi;
  activeSection: SectionId;
  appGroupIds: string[];
  onAppsChange: (apps: AppEntry[]) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onSearchDismiss: () => void;
  onAdded: (groupId: string, appId: string) => void;
  refreshRuntimeData: (force: boolean) => Promise<unknown>;
};

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function useExecutableDrop(options: UseExecutableDropOptions) {
  const { client, activeSection, appGroupIds, onAppsChange, onError, onNotice, onSearchDismiss, onAdded, refreshRuntimeData } = options;
  const [fileDropActive, setFileDropActive] = useState(false);
  const fileDropDepth = useRef(0);

  const addDroppedApps = useCallback(async (filePaths: string[]) => {
    const groupId = targetDropGroupId(activeSection, appGroupIds);
    if (!groupId) return;
    try {
      onError("");
      const result = await client.addDroppedExecutables(filePaths, groupId);
      onAppsChange(result.apps);
      onNotice(dropNoticeForResult(result));
      onSearchDismiss();
      if (result.addedAppIds.length) onAdded(groupId, result.addedAppIds[0]);
      await refreshRuntimeData(true);
    } catch (reason) {
      onError(cleanErrorMessage(reason, "添加应用失败"));
    }
  }, [activeSection, appGroupIds, client, onAdded, onAppsChange, onError, onNotice, onSearchDismiss, refreshRuntimeData]);

  const handleFileDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDropDepth.current += 1;
    setFileDropActive(true);
  };
  const handleFileDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleFileDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    fileDropDepth.current = Math.max(0, fileDropDepth.current - 1);
    if (!fileDropDepth.current) setFileDropActive(false);
  };
  const handleFileDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDropDepth.current = 0;
    setFileDropActive(false);
    const appPaths = droppedAppPaths(Array.from(event.dataTransfer.files), (file) => client.getPathForFile(file));
    if (!appPaths.length) {
      onError("请拖入 exe 程序文件或应用快捷方式");
      return;
    }
    void addDroppedApps(appPaths);
  };

  return { fileDropActive, handleFileDragEnter, handleFileDragLeave, handleFileDragOver, handleFileDrop };
}
