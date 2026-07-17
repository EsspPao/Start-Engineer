import type { AppEntry, AppFolder, AppFolderInput, AppFolderUpdateInput, AppGroup, FolderMutationResult, GroupGridItemId, GroupGridOrder, GroupInput, GroupUpdateInput, MoveFolderMemberInput, RemoveGroupResult } from "../shared/types.js";
import { normalizeGroups } from "./config-migration.js";
import { JsonConfigStore } from "./config-store.js";

type GroupServiceOptions = {
  groupsPath: () => string;
  foldersPath: () => string;
  gridPath: () => string;
  getApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[] | void;
  randomId: () => string;
};

const systemGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
const allowedGroupIcons = new Set(["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"]);
const defaultGroups = (): AppGroup[] => [
  { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 }
];

export class GroupService {
  private readonly groups: JsonConfigStore<AppGroup[]>;
  private readonly folders: JsonConfigStore<AppFolder[]>;
  private readonly gridOrders: JsonConfigStore<GroupGridOrder[]>;

  constructor(private readonly options: GroupServiceOptions) {
    this.groups = new JsonConfigStore({
      path: options.groupsPath,
      normalize: (raw) => {
        if (!Array.isArray(raw) || raw.length === 0) throw new Error("分组配置为空");
        const groups = normalizeGroups(raw as Partial<AppGroup>[], allowedGroupIcons);
        if (!groups.length) throw new Error("没有有效分组");
        return groups.map((group, order) => ({ ...group, isSystem: false, order }));
      },
      fallback: defaultGroups
    });
    this.folders = new JsonConfigStore({
      path: options.foldersPath,
      normalize: (raw) => {
        const seen = new Set<string>();
        return (Array.isArray(raw) ? raw as AppFolder[] : [])
          .map((folder, order) => ({ ...folder, order, appIds: [...new Set(folder.appIds ?? [])].filter((id) => !seen.has(id) && Boolean(seen.add(id))) }))
          .filter((folder) => folder.appIds.length >= 2);
      },
      fallback: () => []
    });
    this.gridOrders = new JsonConfigStore({
      path: options.gridPath,
      normalize: (raw) => this.loadGroups().map((group) => this.normalizeGridOrder(group.id, (Array.isArray(raw) ? raw as GroupGridOrder[] : []).find((item) => item.groupId === group.id)?.itemIds ?? [])),
      fallback: () => []
    });
  }

  loadGroups() { return this.groups.load(); }
  saveGroups(groups: AppGroup[]) { return this.groups.save(groups); }
  listGroups() { return [systemGroups[0], ...this.loadGroups(), systemGroups[1]]; }
  loadFolders() { return this.folders.load(); }
  saveFolders(folders: AppFolder[]) { return this.folders.save(folders); }
  loadGridOrders() { return this.gridOrders.load(); }

  validGroupId(groupId?: string) {
    const groups = this.loadGroups();
    return groups.some((group) => group.id === groupId) ? String(groupId) : groups[0].id;
  }

  validGridItems(groupId: string, apps = this.options.getApps(), folders = this.loadFolders()): GroupGridItemId[] {
    const memberIds = new Set(folders.filter((folder) => folder.groupId === groupId).flatMap((folder) => folder.appIds));
    const appItems = apps.filter((entry) => entry.groupId === groupId && !memberIds.has(entry.id)).map((entry) => `app:${entry.id}` as const);
    const folderItems = folders.filter((folder) => folder.groupId === groupId).map((folder) => `folder:${folder.id}` as const);
    return [...appItems, ...folderItems];
  }

  normalizeGridOrder(groupId: string, itemIds: readonly string[], apps = this.options.getApps(), folders = this.loadFolders()): GroupGridOrder {
    const valid = this.validGridItems(groupId, apps, folders);
    const validSet = new Set(valid);
    const seen = new Set<string>();
    const ordered = itemIds.filter((id): id is GroupGridItemId => validSet.has(id as GroupGridItemId) && !seen.has(id) && Boolean(seen.add(id)));
    return { groupId, itemIds: [...ordered, ...valid.filter((id) => !seen.has(id))] };
  }

  saveGridOrders(orders: GroupGridOrder[], apps = this.options.getApps(), folders = this.loadFolders()) {
    return this.gridOrders.save(this.loadGroups().map((group) => this.normalizeGridOrder(group.id, orders.find((item) => item.groupId === group.id)?.itemIds ?? [], apps, folders)));
  }

  mutateFolders(apps: AppEntry[], folders: AppFolder[]): FolderMutationResult {
    this.options.saveApps(apps);
    this.saveFolders(folders);
    return { apps: this.options.getApps(), folders: this.loadFolders(), gridOrders: this.saveGridOrders(this.loadGridOrders(), apps, folders) };
  }

  createGroup(input: GroupInput) {
    const groups = this.loadGroups();
    this.saveGroups([...groups, { id: this.options.randomId(), name: this.validateGroupName(input.name), icon: this.validateGroupIcon(input.icon), isSystem: false, order: groups.length }]);
    return this.listGroups();
  }

  updateGroup(input: GroupUpdateInput) {
    if (!this.loadGroups().some((group) => group.id === input.id)) throw new Error("分组不存在");
    const name = this.validateGroupName(input.name, input.id);
    this.saveGroups(this.loadGroups().map((group) => group.id === input.id ? { ...group, name, icon: this.validateGroupIcon(input.icon) } : group));
    this.options.saveApps(this.options.getApps().map((entry) => entry.groupId === input.id ? { ...entry, category: name } : entry));
    return this.listGroups();
  }

  reorderGroups(groupIds: string[]) {
    const groups = this.loadGroups();
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length !== groups.length || groups.some((group) => !uniqueIds.includes(group.id))) throw new Error("分组排序数据无效");
    const byId = new Map(groups.map((group) => [group.id, group]));
    this.saveGroups(uniqueIds.map((id) => byId.get(id)!));
    return this.listGroups();
  }

  removeGroup(groupId: string, targetGroupId: string): RemoveGroupResult {
    const groups = this.loadGroups();
    if (groups.length <= 1) throw new Error("至少需要保留一个应用分组");
    if (!groups.some((group) => group.id === groupId)) throw new Error("要删除的分组不存在");
    if (groupId === targetGroupId || !groups.some((group) => group.id === targetGroupId)) throw new Error("请选择有效的迁移目标分组");
    const target = groups.find((group) => group.id === targetGroupId)!;
    const apps = this.options.getApps().map((entry) => entry.groupId === groupId ? { ...entry, groupId: targetGroupId, category: target.name } : entry);
    const folders = this.loadFolders().map((folder) => folder.groupId === groupId ? { ...folder, groupId: targetGroupId } : folder);
    this.options.saveApps(apps);
    this.saveFolders(folders);
    this.saveGroups(groups.filter((group) => group.id !== groupId));
    this.saveGridOrders(this.loadGridOrders(), apps, folders);
    return { groups: this.listGroups(), apps, targetGroupId };
  }

  createFolder(input: AppFolderInput) {
    const groupId = this.validGroupId(input.groupId);
    const appIds = [...new Set(input.appIds)].filter((id) => this.options.getApps().some((app) => app.id === id && app.groupId === groupId));
    if (appIds.length < 2) throw new Error("至少选择两个同分组应用");
    const currentOrders = this.loadGridOrders();
    const currentOrder = currentOrders.find((order) => order.groupId === groupId)?.itemIds ?? [];
    const folders = this.loadFolders().map((folder) => ({ ...folder, appIds: folder.appIds.filter((id) => !appIds.includes(id)) })).filter((folder) => folder.appIds.length >= 2);
    const id = this.options.randomId();
    const next = this.saveFolders([...folders, { id, groupId, name: String(input.name || "多应用卡片").trim() || "多应用卡片", appIds, order: folders.length }]);
    const memberItems = new Set(appIds.map((appId) => `app:${appId}`));
    const firstIndex = currentOrder.findIndex((item) => memberItems.has(item));
    const itemIds = currentOrder.filter((item) => !memberItems.has(item));
    itemIds.splice(firstIndex < 0 ? itemIds.length : firstIndex, 0, `folder:${id}`);
    this.saveGridOrders([...currentOrders.filter((item) => item.groupId !== groupId), { groupId, itemIds }], this.options.getApps(), next);
    return next;
  }

  updateFolder(input: AppFolderUpdateInput) {
    const next = this.saveFolders(this.loadFolders().map((folder) => folder.id === input.id ? { ...folder, ...input, appIds: input.appIds ? [...new Set(input.appIds)].filter((id) => this.options.getApps().some((app) => app.id === id && app.groupId === (input.groupId ?? folder.groupId))) : folder.appIds } : folder).filter((folder) => folder.appIds.length >= 2));
    this.saveGridOrders(this.loadGridOrders(), this.options.getApps(), next);
    return next;
  }

  removeFolder(id: string) {
    const next = this.saveFolders(this.loadFolders().filter((folder) => folder.id !== id));
    this.saveGridOrders(this.loadGridOrders(), this.options.getApps(), next);
    return next;
  }

  moveFolder(folderId: string, targetGroupId: string) {
    const folder = this.loadFolders().find((item) => item.id === folderId);
    if (!folder) throw new Error("多应用卡片不存在");
    const groupId = this.validGroupId(targetGroupId);
    const target = this.loadGroups().find((group) => group.id === groupId)!;
    return this.mutateFolders(
      this.options.getApps().map((entry) => folder.appIds.includes(entry.id) ? { ...entry, groupId, category: target.name } : entry),
      this.loadFolders().map((item) => item.id === folder.id ? { ...item, groupId } : item)
    );
  }

  moveFolderMember(input: MoveFolderMemberInput) {
    const source = this.loadFolders().find((folder) => folder.id === input.sourceFolderId);
    const app = this.options.getApps().find((entry) => entry.id === input.appId);
    if (!source || !app || !source.appIds.includes(input.appId)) throw new Error("多应用卡片成员不存在");
    let targetGroupId = source.groupId;
    let folders = this.loadFolders().map((folder) => folder.id === source.id ? { ...folder, appIds: folder.appIds.filter((id) => id !== input.appId) } : folder);
    if (input.target.kind === "folder") {
      const targetFolderId = input.target.folderId;
      const target = folders.find((folder) => folder.id === targetFolderId);
      if (!target || target.id === source.id) throw new Error("目标多应用卡片无效");
      targetGroupId = target.groupId;
      folders = folders.map((folder) => folder.id === target.id ? { ...folder, appIds: [...folder.appIds, input.appId] } : folder);
    } else targetGroupId = this.validGroupId(input.target.groupId);
    folders = folders.filter((folder) => folder.appIds.length >= 2);
    const target = this.loadGroups().find((group) => group.id === targetGroupId)!;
    const apps = this.options.getApps().map((entry) => entry.id === input.appId ? { ...entry, groupId: targetGroupId, category: target.name } : entry);
    const result = this.mutateFolders(apps, folders);
    if (input.target.kind === "outer" && input.target.index !== undefined) {
      const order = result.gridOrders.find((item) => item.groupId === targetGroupId);
      if (order) {
        const appItem = `app:${input.appId}` as const;
        const itemIds = order.itemIds.filter((id) => id !== appItem);
        itemIds.splice(Math.max(0, Math.min(input.target.index, itemIds.length)), 0, appItem);
        result.gridOrders = this.saveGridOrders([...result.gridOrders.filter((item) => item.groupId !== targetGroupId), { groupId: targetGroupId, itemIds }], apps, folders);
      }
    }
    return result;
  }

  reorderGrid(groupId: string, itemIds: GroupGridItemId[]) {
    if (!this.loadGroups().some((group) => group.id === groupId)) throw new Error("分组不存在");
    const normalized = this.normalizeGridOrder(groupId, itemIds);
    const valid = this.validGridItems(groupId);
    if (normalized.itemIds.length !== valid.length || itemIds.length !== valid.length || valid.some((id) => !itemIds.includes(id))) throw new Error("网格排序数据无效");
    return this.saveGridOrders([...this.loadGridOrders().filter((item) => item.groupId !== groupId), normalized]);
  }

  private validateGroupName(name: string, excludeId?: string) {
    const normalized = name.trim();
    if (!normalized) throw new Error("分组名称不能为空");
    if (normalized.length > 20) throw new Error("分组名称不能超过 20 个字符");
    if (this.loadGroups().some((group) => group.id !== excludeId && group.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) throw new Error("分组名称不能重复");
    return normalized;
  }

  private validateGroupIcon(icon: string) {
    if (!allowedGroupIcons.has(icon)) throw new Error("请选择有效的分组图标");
    return icon;
  }
}
