import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { AppEntry, AppFolderInput, AppFolderUpdateInput, BatchLaunchResult, GroupGridItemId, GroupInput, GroupUpdateInput, LaunchAppResult, MoveFolderMemberInput, UpdateAppInput } from "../shared/types.js";
import { AppService } from "./app-service.js";
import { GroupService } from "./group-service.js";

type LibraryIpcOptions = {
  apps: AppService;
  groups: GroupService;
  launchApp: (id: string) => Promise<LaunchAppResult>;
  launchFolder: (event: IpcMainInvokeEvent, id: string) => Promise<BatchLaunchResult>;
};

export function registerLibraryIpc(options: LibraryIpcOptions) {
  const { apps, groups } = options;
  ipcMain.handle("groups:list", () => groups.listGroups());
  ipcMain.handle("groups:create", (_event, input: GroupInput) => groups.createGroup(input));
  ipcMain.handle("groups:update", (_event, input: GroupUpdateInput) => groups.updateGroup(input));
  ipcMain.handle("groups:reorder", (_event, ids: string[]) => groups.reorderGroups(ids));
  ipcMain.handle("groups:remove", (_event, groupId: string, targetGroupId: string) => groups.removeGroup(groupId, targetGroupId));

  ipcMain.handle("folders:list", () => groups.loadFolders());
  ipcMain.handle("folders:create", (_event, input: AppFolderInput) => groups.createFolder(input));
  ipcMain.handle("folders:update", (_event, input: AppFolderUpdateInput) => groups.updateFolder(input));
  ipcMain.handle("folders:remove", (_event, id: string) => groups.removeFolder(id));
  ipcMain.handle("folders:launch", (event, id: string) => options.launchFolder(event, id));
  ipcMain.handle("folders:move", (_event, id: string, groupId: string) => groups.moveFolder(id, groupId));
  ipcMain.handle("folders:merge", (_event, sourceFolderId: string, targetFolderId: string) => groups.mergeFolders(sourceFolderId, targetFolderId));
  ipcMain.handle("folders:moveMember", (_event, input: MoveFolderMemberInput) => groups.moveFolderMember(input));

  ipcMain.handle("groupGrid:list", () => groups.saveGridOrders(groups.loadGridOrders()));
  ipcMain.handle("groupGrid:reorder", (_event, groupId: string, itemIds: GroupGridItemId[]) => groups.reorderGrid(groupId, itemIds));

  ipcMain.handle("apps:list", () => apps.loadApps());
  ipcMain.handle("apps:update", (_event, input: UpdateAppInput) => apps.update(input));
  ipcMain.handle("apps:setGroup", (_event, id: string, groupId: AppEntry["groupId"]) => {
    const nextApps = apps.setGroup(id, groupId);
    cleanFolderMembership(groups, id, nextApps);
    return nextApps;
  });
  ipcMain.handle("apps:reorderInGroup", (_event, groupId: AppEntry["groupId"], appIds: string[]) => apps.reorderInGroup(groupId, appIds));
  ipcMain.handle("apps:launch", (_event, id: string) => options.launchApp(id));
  ipcMain.handle("apps:remove", (_event, id: string) => {
    const nextApps = apps.remove(id);
    cleanFolderMembership(groups, id, nextApps);
    return nextApps;
  });
}

function cleanFolderMembership(groups: GroupService, appId: string, apps: AppEntry[]) {
  const folders = groups.saveFolders(groups.loadFolders().map((folder) => ({ ...folder, appIds: folder.appIds.filter((id) => id !== appId) })).filter((folder) => folder.appIds.length >= 2));
  groups.saveGridOrders(groups.loadGridOrders(), apps, folders);
}
