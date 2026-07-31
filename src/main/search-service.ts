import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { AppEntry, AppGroup, AppPreferences, DiscoveredAppCandidate } from "../shared/types.js";
import { buildDiscoveredApps, buildWindowsStoreAppCandidates, filterNewShortcuts, searchDiscoveredAppCandidates, type ShortcutInfo, type ShortcutSource } from "./app-discovery.js";
import { searchEverything } from "./everything-search.js";
import { runNativeHelper } from "./native-helper.js";
import { inferPackageFamilyName, type WindowsStoreAppIdentity } from "./windows-store-apps.js";
import { curateFirstRunImportCandidates } from "./first-run-import.js";

type SearchServiceOptions = {
  getPath: (name: "appData" | "desktop") => string;
  runPowerShell: (script: string) => Promise<string>;
  getPreferences: () => AppPreferences;
  savePreferences: (preferences: AppPreferences) => AppPreferences;
  getGroups: () => AppGroup[];
  validGroupId: (groupId?: string) => string;
  loadApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[] | void;
  cacheIcon: (entry: AppEntry) => Promise<AppEntry>;
  randomId: () => string;
  listWindowsStoreApps?: () => Promise<WindowsStoreAppIdentity[]>;
  loadFirstRunImportTemplate?: () => AppEntry[];
};

const normalizePath = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

export class SearchService {
  private firstRunAutoImport: Promise<AppEntry[]> | null = null;
  private importCandidates: DiscoveredAppCandidate[] = [];
  private shortcuts: ShortcutInfo[] | null = null;
  private candidates: DiscoveredAppCandidate[] = [];

  constructor(private readonly options: SearchServiceOptions) {}

  async searchCandidates(query: string) {
    const [base, everything, windowsStoreApps] = await Promise.all([
      this.discoveryShortcuts(),
      this.everythingShortcuts(query),
      this.options.listWindowsStoreApps?.().catch(() => []) ?? Promise.resolve([])
    ]);
    const fileCandidates = buildDiscoveredApps([...base, ...everything], this.options.getGroups(), this.options.randomId);
    const storeCandidates = buildWindowsStoreAppCandidates(windowsStoreApps, this.options.getGroups(), this.options.randomId);
    this.candidates = this.mergeCandidates(storeCandidates, fileCandidates);
    return searchDiscoveredAppCandidates(this.candidates, query, this.options.loadApps());
  }

  async refreshIndex() {
    const [shortcuts, windowsStoreApps] = await Promise.all([
      this.discoverShortcuts(),
      this.options.listWindowsStoreApps?.().catch(() => []) ?? Promise.resolve([])
    ]);
    this.shortcuts = shortcuts;
    this.candidates = this.mergeCandidates(
      buildWindowsStoreAppCandidates(windowsStoreApps, this.options.getGroups(), this.options.randomId),
      buildDiscoveredApps(this.shortcuts, this.options.getGroups(), this.options.randomId)
    );
    return searchDiscoveredAppCandidates(this.candidates, "", this.options.loadApps());
  }

  async discoverImportCandidates() {
    const currentApps = this.options.loadApps();
    const [shortcuts, windowsStoreApps] = await Promise.all([
      this.discoveryShortcuts(true),
      this.options.listWindowsStoreApps?.() ?? Promise.resolve([])
    ]);
    const newShortcuts = filterNewShortcuts(shortcuts, currentApps.map((entry) => entry.executablePath));
    const fileCandidates = buildDiscoveredApps(newShortcuts, this.options.getGroups(), this.options.randomId);
    const storeCandidates = buildWindowsStoreAppCandidates(windowsStoreApps, this.options.getGroups(), this.options.randomId)
      .filter((candidate) => !this.findExistingCandidate(candidate, currentApps));
    this.importCandidates = curateFirstRunImportCandidates({
      candidates: this.mergeCandidates(storeCandidates, fileCandidates),
      groups: this.options.getGroups(),
      templateApps: this.options.loadFirstRunImportTemplate?.(),
      createId: this.options.randomId,
      pathExists: existsSync
    });
    return this.importCandidates;
  }

  autoImportFirstRunApps() {
    if (this.firstRunAutoImport) return this.firstRunAutoImport;
    const operation = this.performFirstRunAutoImport().finally(() => {
      if (this.firstRunAutoImport === operation) this.firstRunAutoImport = null;
    });
    this.firstRunAutoImport = operation;
    return operation;
  }

  async resolveShortcut(filePath: string) {
    const shortcut = (await this.resolveShortcutFiles([filePath], "desktop"))[0];
    if (!shortcut) return null;
    return {
      executablePath: shortcut.targetPath,
      name: shortcut.name,
      workingDirectory: shortcut.workingDirectory,
      launchArgs: shortcut.launchArgs
    };
  }

  async addCandidate(candidateId: string, groupId: string) {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error("未找到该应用候选");
    const currentApps = this.options.loadApps();
    const existing = this.findExistingCandidate(candidate, currentApps);
    if (existing) {
      if (candidate.appUserModelId) {
        const repaired = await this.options.cacheIcon(this.storeEntryFromCandidate(candidate, existing.groupId, existing.category, existing));
        const apps = currentApps.map((entry) => entry.id === existing.id ? repaired : entry);
        this.options.saveApps(apps);
        return { apps, appId: existing.id, added: false, alreadyAdded: true };
      }
      return { apps: currentApps, appId: existing.id, added: false, alreadyAdded: true };
    }
    if (!candidate.appUserModelId && !existsSync(candidate.executablePath)) throw new Error("无法解析快捷方式");
    const validGroupId = this.options.validGroupId(groupId);
    const group = this.options.getGroups().find((item) => item.id === validGroupId)!;
    const entry = await this.options.cacheIcon(candidate.appUserModelId
      ? this.storeEntryFromCandidate(candidate, group.id, group.name)
      : {
        id: this.options.randomId(), name: candidate.name, category: group.name, groupId: group.id,
        executablePath: candidate.executablePath, processName: candidate.processName,
        workingDirectory: candidate.workingDirectory || dirname(candidate.executablePath), launchArgs: candidate.launchArgs, accent: "#2f66e8"
      });
    const apps = [...currentApps, entry];
    this.options.saveApps(apps);
    return { apps, appId: entry.id, added: true };
  }

  async importCandidatesById(candidateIds: string[]) {
    const selected = new Set(candidateIds);
    const existing = new Set(this.options.loadApps().map((entry) => entry.executablePath.trim().toLowerCase()));
    const imported: AppEntry[] = [];
    for (const candidate of this.importCandidates.filter((item) => selected.has(item.id))) {
      if (candidate.isAvailable === false) continue;
      const key = candidate.executablePath.trim().toLowerCase();
      if ((!candidate.appUserModelId && (!key || !existsSync(candidate.executablePath))) || (key && existing.has(key))) continue;
      if (this.findExistingCandidate(candidate, [...this.options.loadApps(), ...imported])) continue;
      if (key) existing.add(key);
      const entry: AppEntry = candidate.appUserModelId
        ? this.storeEntryFromCandidate(candidate, this.options.validGroupId(candidate.groupId), candidate.category)
        : {
          id: this.options.randomId(), name: candidate.name, category: candidate.category,
          groupId: this.options.validGroupId(candidate.groupId), executablePath: candidate.executablePath,
          processName: candidate.processName, workingDirectory: candidate.workingDirectory || dirname(candidate.executablePath),
          launchArgs: candidate.launchArgs, accent: "#2f66e8"
        };
      const reusableIcon = Boolean(candidate.iconDataUrl && candidate.iconCachePath && existsSync(candidate.iconCachePath));
      const cachedEntry = reusableIcon ? {
        ...entry,
        iconCachePath: candidate.iconCachePath,
        iconDataUrl: candidate.iconDataUrl,
        iconCacheVersion: candidate.iconCacheVersion,
        iconPixelSize: candidate.iconPixelSize
      } : await this.options.cacheIcon(entry);
      if (this.findExistingCandidate(candidate, [...this.options.loadApps(), ...imported])) continue;
      imported.push(cachedEntry);
    }
    const latestApps = this.options.loadApps();
    const uniqueImported: AppEntry[] = [];
    for (const entry of imported) {
      if (!this.findExistingCandidate(entry, [...latestApps, ...uniqueImported])) uniqueImported.push(entry);
    }
    const apps = [...latestApps, ...uniqueImported];
    this.options.saveApps(apps);
    this.options.savePreferences({ ...this.options.getPreferences(), firstRunImportCompleted: true });
    this.importCandidates = [];
    return apps;
  }

  private async performFirstRunAutoImport() {
    const currentApps = this.options.loadApps();
    const currentPreferences = this.options.getPreferences();
    if (currentPreferences.firstRunImportCompleted) return currentApps;
    if (currentApps.length) {
      this.options.savePreferences({ ...currentPreferences, firstRunImportCompleted: true });
      return currentApps;
    }

    const candidates = await this.discoverImportCandidates();
    const latestApps = this.options.loadApps();
    const latestPreferences = this.options.getPreferences();
    if (latestPreferences.firstRunImportCompleted) {
      this.importCandidates = [];
      return latestApps;
    }
    if (latestApps.length) {
      this.importCandidates = [];
      this.options.savePreferences({ ...latestPreferences, firstRunImportCompleted: true });
      return latestApps;
    }
    return this.importCandidatesById(candidates.filter((candidate) => candidate.isAvailable !== false).map((candidate) => candidate.id));
  }

  private shortcutRoots() {
    const roots: Array<{ path: string; source: ShortcutSource }> = [
      { path: join(this.options.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs"), source: "start-menu" },
      { path: this.options.getPath("desktop"), source: "desktop" }
    ];
    if (process.env.ProgramData) roots.push({ path: join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"), source: "start-menu" });
    if (process.env.PUBLIC) roots.push({ path: join(process.env.PUBLIC, "Desktop"), source: "desktop" });
    return roots.filter((root) => existsSync(root.path));
  }

  private async discoverShortcuts(): Promise<ShortcutInfo[]> {
    const roots = this.shortcutRoots();
    if (!roots.length) return [];
    try { return this.parseShortcutOutput(await runNativeHelper("shortcuts", { roots }, 30_000)); } catch { /* PowerShell fallback below. */ }
    const payload = Buffer.from(JSON.stringify(roots), "utf16le").toString("base64");
    const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$roots = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$rows = foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath ([string]$root.path))) { continue }
  Get-ChildItem -LiteralPath ([string]$root.path) -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try { $shortcut = $shell.CreateShortcut($_.FullName); if ([string]::IsNullOrWhiteSpace($shortcut.TargetPath)) { return }; [PSCustomObject]@{ name = [IO.Path]::GetFileNameWithoutExtension($_.Name); targetPath = [string]$shortcut.TargetPath; shortcutPath = [string]$_.FullName; workingDirectory = [string]$shortcut.WorkingDirectory; launchArgs = [string]$shortcut.Arguments; iconPath = [string]$shortcut.IconLocation; source = [string]$root.source } } catch {}
  }
}
$rows | ConvertTo-Json -Compress`;
    return this.parseShortcutOutput(await this.options.runPowerShell(script));
  }

  private async discoveryShortcuts(force = false) {
    if (!force && this.shortcuts) return this.shortcuts;
    this.shortcuts = await this.discoverShortcuts();
    return this.shortcuts;
  }

  private async resolveShortcutFiles(paths: string[], source: ShortcutSource): Promise<ShortcutInfo[]> {
    const validPaths = [...new Set(paths.filter((item) => item.toLowerCase().endsWith(".lnk") && existsSync(item)))];
    if (!validPaths.length) return [];
    try { return this.parseShortcutOutput(await runNativeHelper("shortcuts", { paths: validPaths, source }, 15_000)); } catch { /* PowerShell fallback below. */ }
    const payload = Buffer.from(JSON.stringify(validPaths), "utf16le").toString("base64");
    const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$paths = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$rows = foreach ($path in $paths) { try { $shortcut = $shell.CreateShortcut([string]$path); if ([string]::IsNullOrWhiteSpace($shortcut.TargetPath)) { continue }; [PSCustomObject]@{ name = [IO.Path]::GetFileNameWithoutExtension([string]$path); targetPath = [string]$shortcut.TargetPath; shortcutPath = [string]$path; workingDirectory = [string]$shortcut.WorkingDirectory; launchArgs = [string]$shortcut.Arguments; iconPath = [string]$shortcut.IconLocation; source = '${source}' } } catch {} }
$rows | ConvertTo-Json -Compress`;
    return this.parseShortcutOutput(await this.options.runPowerShell(script));
  }

  private async everythingShortcuts(query: string): Promise<ShortcutInfo[]> {
    if (query.trim().length < 2) return [];
    try {
      const results = await searchEverything(query.trim(), { cliPath: this.options.getPreferences().everythingCliPath, limit: 50, timeoutMs: 1800 });
      const files = results.filter((result) => result.kind === "file");
      const links = await this.resolveShortcutFiles(files.filter((result) => result.path.toLowerCase().endsWith(".lnk")).map((result) => result.path), "everything");
      const executables = files.filter((result) => result.path.toLowerCase().endsWith(".exe")).map<ShortcutInfo>((result) => ({ name: basename(result.name, extname(result.name)), targetPath: result.path, source: "everything" }));
      return [...links, ...executables];
    } catch { return []; }
  }

  private parseShortcutOutput(output: string) {
    const trimmed = output.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed) as ShortcutInfo[] | ShortcutInfo;
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  private mergeCandidates(...candidateSets: DiscoveredAppCandidate[][]) {
    const merged = new Map<string, DiscoveredAppCandidate>();
    const seenPaths = new Set<string>();
    for (const candidate of candidateSets.flat()) {
      const normalizedPath = normalizePath(candidate.executablePath);
      if (normalizedPath && seenPaths.has(normalizedPath)) continue;
      const key = candidate.appUserModelId
        ? `aumid:${candidate.appUserModelId.toLocaleLowerCase()}`
        : `path:${normalizedPath}`;
      if (!merged.has(key)) {
        merged.set(key, candidate);
        if (normalizedPath) seenPaths.add(normalizedPath);
      }
    }
    return [...merged.values()];
  }

  private findExistingCandidate(candidate: Pick<DiscoveredAppCandidate, "appUserModelId" | "executablePath" | "processName" | "name">, apps: AppEntry[]) {
    const appUserModelId = candidate.appUserModelId?.toLocaleLowerCase();
    const packageFamilyName = appUserModelId?.split("!")[0];
    return apps.find((entry) => {
      if (appUserModelId && entry.appUserModelId?.toLocaleLowerCase() === appUserModelId) return true;
      if (candidate.executablePath && normalizePath(entry.executablePath) === normalizePath(candidate.executablePath)) return true;
      if (!entry.appUserModelId && packageFamilyName && inferPackageFamilyName(entry.executablePath).toLocaleLowerCase() === packageFamilyName) {
        return entry.processName.trim().toLocaleLowerCase() === candidate.processName.trim().toLocaleLowerCase()
          || entry.name.trim().toLocaleLowerCase() === candidate.name.trim().toLocaleLowerCase();
      }
      return false;
    });
  }

  private storeEntryFromCandidate(candidate: DiscoveredAppCandidate, groupId: string, category: string, existing?: AppEntry): AppEntry {
    const executablePath = candidate.executablePath;
    return {
      ...(existing ?? {
        id: this.options.randomId(),
        name: candidate.name,
        accent: "#2f66e8"
      }),
      name: existing?.name || candidate.name,
      category,
      groupId,
      executablePath,
      processName: candidate.processName || existing?.processName || candidate.name,
      ...(candidate.workingDirectory ? { workingDirectory: candidate.workingDirectory } : { workingDirectory: undefined }),
      appUserModelId: candidate.appUserModelId
    };
  }
}
