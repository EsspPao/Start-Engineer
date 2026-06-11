import { contextBridge, ipcRenderer } from "electron";
import type { AppEntry, CommandDeckApi, GroupInput, GroupUpdateInput, UpdateAppInput, WindowAction } from "../shared/types.js";

const api: CommandDeckApi = {
  listGroups: () => ipcRenderer.invoke("groups:list"),
  createGroup: (input: GroupInput) => ipcRenderer.invoke("groups:create", input),
  updateGroup: (input: GroupUpdateInput) => ipcRenderer.invoke("groups:update", input),
  reorderGroups: (groupIds: string[]) => ipcRenderer.invoke("groups:reorder", groupIds),
  removeGroup: (groupId: string, targetGroupId: string) => ipcRenderer.invoke("groups:remove", groupId, targetGroupId),
  listApps: () => ipcRenderer.invoke("apps:list"),
  addAppFromDialog: (groupId?: AppEntry["groupId"]) => ipcRenderer.invoke("apps:addFromDialog", groupId),
  pickExecutable: (id: string) => ipcRenderer.invoke("apps:pickExecutable", id),
  updateApp: (input: UpdateAppInput) => ipcRenderer.invoke("apps:update", input),
  setAppGroup: (id: string, groupId: AppEntry["groupId"]) => ipcRenderer.invoke("apps:setGroup", id, groupId),
  launchApp: (id: string) => ipcRenderer.invoke("apps:launch", id),
  killApp: (id: string) => ipcRenderer.invoke("apps:kill", id),
  removeApp: (id: string) => ipcRenderer.invoke("apps:remove", id),
  killProcessGroup: (input: { name: string; pids: number[] }) => ipcRenderer.invoke("processes:killGroup", input),
  showItemInFolder: (path: string) => ipcRenderer.invoke("shell:showItemInFolder", path),
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
  getMetricsSnapshot: () => ipcRenderer.invoke("metrics:snapshot"),
  getProcessSnapshot: () => ipcRenderer.invoke("processes:snapshot"),
  getRuntimeSnapshot: () => ipcRenderer.invoke("runtime:snapshot"),
  windowAction: (action: WindowAction) => ipcRenderer.invoke("window:action", action)
};

contextBridge.exposeInMainWorld("commandDeck", api);
