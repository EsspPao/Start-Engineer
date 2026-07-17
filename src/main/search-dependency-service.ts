import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { AppPreferences, SearchDependencyStatus } from "../shared/types.js";
import { buildEverythingDownloadPlan, clearTempDependencyDir, downloadFile, expandZip, getManagedEverythingPaths, getSearchDependencyStatus } from "./search-dependencies.js";

type SearchDependencyServiceOptions = {
  getUserDataPath: () => string;
  loadPreferences: () => AppPreferences;
  savePreferences: (preferences: AppPreferences) => AppPreferences;
  exists?: (path: string) => boolean;
  download?: typeof downloadFile;
  expand?: typeof expandZip;
  clearTemp?: typeof clearTempDependencyDir;
  startEverything?: (path: string) => void;
};

export class SearchDependencyService {
  private statusCache: SearchDependencyStatus | null = null;
  private prepareInFlight: Promise<SearchDependencyStatus> | null = null;

  constructor(private readonly options: SearchDependencyServiceOptions) {}

  getStatus() {
    if (this.statusCache && this.statusCache.state !== "ready" && this.statusCache.state !== "missing") return this.statusCache;
    this.statusCache = getSearchDependencyStatus(this.options.loadPreferences(), this.options.getUserDataPath(), { exists: this.options.exists });
    return this.statusCache;
  }

  prepare() {
    if (this.prepareInFlight) return this.prepareInFlight;
    this.prepareInFlight = this.prepareInternal().finally(() => { this.prepareInFlight = null; });
    return this.prepareInFlight;
  }

  invalidate() {
    this.statusCache = null;
  }

  private async prepareInternal(): Promise<SearchDependencyStatus> {
    const userDataPath = this.options.getUserDataPath();
    const existing = getSearchDependencyStatus(this.options.loadPreferences(), userDataPath, { exists: this.options.exists });
    if (existing.state === "ready") return existing;
    const plan = buildEverythingDownloadPlan(userDataPath);
    const paths = getManagedEverythingPaths(userDataPath);
    const download = this.options.download ?? downloadFile;
    const expand = this.options.expand ?? expandZip;
    const clearTemp = this.options.clearTemp ?? clearTempDependencyDir;
    const exists = this.options.exists ?? existsSync;
    try {
      clearTemp(userDataPath);
      this.statusCache = { state: "downloading", message: "正在下载 Everything 便携版" };
      await download(plan.everything.url, plan.everything.tempZip, (downloadedBytes, totalBytes) => {
        this.statusCache = { state: "downloading", message: "正在下载 Everything 便携版", downloadedBytes, totalBytes };
      });
      this.statusCache = { state: "downloading", message: "正在下载 Everything 命令行工具" };
      await download(plan.es.url, plan.es.tempZip, (downloadedBytes, totalBytes) => {
        this.statusCache = { state: "downloading", message: "正在下载 Everything 命令行工具", downloadedBytes, totalBytes };
      });
      this.statusCache = { state: "extracting", message: "正在解压 Everything 搜索依赖" };
      await expand(plan.everything.tempZip, plan.everything.finalDir);
      await expand(plan.es.tempZip, plan.es.finalDir);
      clearTemp(userDataPath);
      if (!exists(paths.everythingCliPath) || !exists(paths.everythingPath)) throw new Error("Everything 依赖解压后不完整");
      this.options.savePreferences({ ...this.options.loadPreferences(), everythingCliPath: paths.everythingCliPath, everythingManagedPath: paths.everythingPath });
      this.statusCache = { state: "starting", message: "正在启动 Everything 便携版", everythingPath: paths.everythingPath, everythingCliPath: paths.everythingCliPath };
      (this.options.startEverything ?? startEverything)(paths.everythingPath);
      this.statusCache = { state: "ready", message: "Everything 搜索依赖已就绪", everythingPath: paths.everythingPath, everythingCliPath: paths.everythingCliPath };
      return this.statusCache;
    } catch (reason) {
      clearTemp(userDataPath);
      this.statusCache = { state: "failed", message: cleanDependencyError(reason) };
      return this.statusCache;
    }
  }
}

function startEverything(path: string) {
  spawn(path, ["-startup"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function cleanDependencyError(reason: unknown) {
  return reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "准备 Everything 搜索依赖失败";
}
