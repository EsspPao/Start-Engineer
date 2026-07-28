import { existsSync, rmSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import type { AppEntry, AppGroup, UpdateAppInput } from "../shared/types.js";
import { mergeVisibleAppOrder } from "./app-order.js";
import { migrateAppEntry } from "./config-migration.js";
import { JsonConfigStore } from "./config-store.js";

type AppServiceOptions = {
  appsPath: () => string;
  iconCacheDir: () => string;
  getGroups: () => AppGroup[];
  validGroupId: (groupId?: string) => string;
  randomId: () => string;
  cacheIcon: (entry: AppEntry) => Promise<AppEntry>;
  runtimeAssociatedPids: Map<string, Set<number>>;
  onAppsChanged?: (apps: AppEntry[]) => void;
};

export class AppService {
  private readonly store: JsonConfigStore<AppEntry[]>;

  constructor(private readonly options: AppServiceOptions) {
    this.store = new JsonConfigStore({
      path: options.appsPath,
      normalize: (raw) => (Array.isArray(raw) ? raw as Partial<AppEntry>[] : []).map((entry) => migrateAppEntry(entry, options.validGroupId(entry.groupId), options.randomId)),
      fallback: () => [],
      serialize: (apps) => apps.map(({ associatedPids: _associatedPids, processAliases: _processAliases, launchedPid: _launchedPid, ...entry }) => entry)
    });
  }

  loadApps() { return this.store.load(); }

  saveApps(apps: AppEntry[]) {
    const saved = this.store.save(apps.map(({ associatedPids: _associatedPids, processAliases: _processAliases, ...entry }) => entry));
    this.options.onAppsChanged?.(saved);
    return saved;
  }

  getApp(id: string) { return this.loadApps().find((entry) => entry.id === id); }

  loadWithRuntimeAssociations() {
    return this.loadApps().map((entry) => {
      const associatedPids = [...(this.options.runtimeAssociatedPids.get(entry.id) ?? [])];
      return associatedPids.length ? { ...entry, associatedPids } : entry;
    });
  }

  async update(input: UpdateAppInput) {
    this.options.runtimeAssociatedPids.delete(input.id);
    const apps = await Promise.all(this.loadApps().map(async (entry) => {
      if (entry.id !== input.id) return entry;
      const executableChanged = Boolean(input.executablePath && input.executablePath !== entry.executablePath);
      const next = executableChanged ? {
        ...entry,
        ...input,
        processName: basename(input.executablePath!, extname(input.executablePath!)),
        workingDirectory: Object.prototype.hasOwnProperty.call(input, "workingDirectory") ? input.workingDirectory : dirname(input.executablePath!),
        appUserModelId: Object.prototype.hasOwnProperty.call(input, "appUserModelId") ? input.appUserModelId : undefined
      } : { ...entry, ...input };
      return executableChanged ? this.options.cacheIcon(next) : next;
    }));
    return this.saveApps(apps);
  }

  setGroup(id: string, groupId: string) {
    const validGroupId = this.options.validGroupId(groupId);
    const group = this.options.getGroups().find((item) => item.id === validGroupId)!;
    return this.saveApps(this.loadApps().map((entry) => entry.id === id ? { ...entry, groupId: validGroupId, category: group.name } : entry));
  }

  reorderInGroup(groupId: string, appIds: string[]) {
    if (!this.options.getGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    if (!Array.isArray(appIds) || appIds.length === 0) throw new Error("排序数据无效。");
    return this.saveApps(mergeVisibleAppOrder(this.loadApps(), groupId, appIds));
  }

  remove(id: string) {
    const entry = this.getApp(id);
    this.options.runtimeAssociatedPids.delete(id);
    const apps = this.saveApps(this.loadApps().filter((item) => item.id !== id));
    if (entry?.iconCachePath && entry.iconCachePath.startsWith(this.options.iconCacheDir()) && existsSync(entry.iconCachePath)) rmSync(entry.iconCachePath, { force: true });
    return apps;
  }
}
