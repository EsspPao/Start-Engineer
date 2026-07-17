import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { AppEntry, AppGroup, AppPreferences, DiscoveredAppCandidate } from "../shared/types.js";
import { buildDiscoveredApps, filterNewShortcuts, searchDiscoveredAppCandidates, type ShortcutInfo, type ShortcutSource } from "./app-discovery.js";
import { searchEverything } from "./everything-search.js";
import { runNativeHelper } from "./native-helper.js";

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
};

const normalizePath = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

export class SearchService {
  private importCandidates: DiscoveredAppCandidate[] = [];
  private shortcuts: ShortcutInfo[] | null = null;
  private candidates: DiscoveredAppCandidate[] = [];

  constructor(private readonly options: SearchServiceOptions) {}

  async searchCandidates(query: string) {
    const base = await this.discoveryShortcuts();
    const everything = await this.everythingShortcuts(query);
    this.candidates = buildDiscoveredApps([...base, ...everything], this.options.getGroups(), this.options.randomId);
    return searchDiscoveredAppCandidates(this.candidates, query, this.options.loadApps());
  }

  async refreshIndex() {
    this.shortcuts = await this.discoverShortcuts();
    this.candidates = buildDiscoveredApps(this.shortcuts, this.options.getGroups(), this.options.randomId);
    return searchDiscoveredAppCandidates(this.candidates, "", this.options.loadApps());
  }

  async discoverImportCandidates() {
    const shortcuts = filterNewShortcuts(await this.discoveryShortcuts(true), this.options.loadApps().map((entry) => entry.executablePath));
    this.importCandidates = buildDiscoveredApps(shortcuts, this.options.getGroups(), this.options.randomId).slice(0, 80);
    return this.importCandidates;
  }

  async addCandidate(candidateId: string, groupId: string) {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error("未找到该应用候选");
    const existing = this.options.loadApps().find((entry) => normalizePath(entry.executablePath) === normalizePath(candidate.executablePath));
    if (existing) return { apps: this.options.loadApps(), appId: existing.id, added: false, alreadyAdded: true };
    if (!existsSync(candidate.executablePath)) throw new Error("无法解析快捷方式");
    const validGroupId = this.options.validGroupId(groupId);
    const group = this.options.getGroups().find((item) => item.id === validGroupId)!;
    const entry = await this.options.cacheIcon({
      id: this.options.randomId(), name: candidate.name, category: group.name, groupId: group.id,
      executablePath: candidate.executablePath, processName: candidate.processName,
      workingDirectory: candidate.workingDirectory || dirname(candidate.executablePath), launchArgs: candidate.launchArgs, accent: "#2f66e8"
    });
    const apps = [...this.options.loadApps(), entry];
    this.options.saveApps(apps);
    return { apps, appId: entry.id, added: true };
  }

  async importCandidatesById(candidateIds: string[]) {
    const selected = new Set(candidateIds);
    const existing = new Set(this.options.loadApps().map((entry) => entry.executablePath.trim().toLowerCase()));
    const imported: AppEntry[] = [];
    for (const candidate of this.importCandidates.filter((item) => selected.has(item.id))) {
      const key = candidate.executablePath.trim().toLowerCase();
      if (!key || existing.has(key) || !existsSync(candidate.executablePath)) continue;
      existing.add(key);
      imported.push(await this.options.cacheIcon({
        id: this.options.randomId(), name: candidate.name, category: candidate.category,
        groupId: this.options.validGroupId(candidate.groupId), executablePath: candidate.executablePath,
        processName: candidate.processName, workingDirectory: dirname(candidate.executablePath), accent: "#2f66e8"
      }));
    }
    const apps = [...this.options.loadApps(), ...imported];
    this.options.saveApps(apps);
    this.options.savePreferences({ ...this.options.getPreferences(), firstRunImportCompleted: true });
    this.importCandidates = [];
    return apps;
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
}
