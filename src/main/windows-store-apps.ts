import { basename, dirname, extname } from "node:path";
import type { AppEntry } from "../shared/types.js";

export type WindowsStoreAppIdentity = {
  name: string;
  appUserModelId: string;
  packageFamilyName: string;
  executablePath: string;
  processName: string;
  workingDirectory?: string;
};

type WindowsStoreAppServiceOptions = {
  runPowerShell: (script: string) => Promise<string>;
  now?: () => number;
  cacheTtlMs?: number;
};

const windowsAppsSegment = /[\\/]WindowsApps[\\/]([^\\/]+)/i;
const packageDirectoryPattern = /^(.+?)_\d+(?:\.\d+){3}_(?:x64|x86|arm64|neutral)_[^_]*_([^_]+)$/i;

export function windowsStoreShellTarget(appUserModelId: string) {
  return `shell:AppsFolder\\${appUserModelId.trim()}`;
}

export function inferPackageFamilyName(executablePath: string) {
  const packageDirectory = windowsAppsSegment.exec(executablePath)?.[1] ?? "";
  const match = packageDirectoryPattern.exec(packageDirectory);
  return match ? `${match[1]}_${match[2]}` : "";
}

export function parseWindowsStoreApps(output: string): WindowsStoreAppIdentity[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const seen = new Set<string>();
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const appUserModelId = String(raw.appUserModelId ?? "").trim();
    const separator = appUserModelId.indexOf("!");
    if (separator <= 0 || separator === appUserModelId.length - 1) return [];
    const key = appUserModelId.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const executablePath = String(raw.executablePath ?? "").trim().replace(/\//g, "\\");
    const packageFamilyName = String(raw.packageFamilyName ?? appUserModelId.slice(0, separator)).trim();
    const processName = String(raw.processName ?? "").trim()
      || (executablePath ? basename(executablePath, extname(executablePath)) : "")
      || String(raw.name ?? "").trim();
    return [{
      name: String(raw.name ?? processName).trim() || processName,
      appUserModelId,
      packageFamilyName,
      executablePath,
      processName,
      ...(executablePath ? { workingDirectory: dirname(executablePath) } : {})
    }];
  });
}

export function findWindowsStoreApp(entry: Pick<AppEntry, "name" | "executablePath" | "processName" | "appUserModelId">, apps: WindowsStoreAppIdentity[]) {
  const appUserModelId = entry.appUserModelId?.trim().toLocaleLowerCase();
  if (appUserModelId) {
    const exact = apps.find((app) => app.appUserModelId.toLocaleLowerCase() === appUserModelId);
    if (exact) return exact;
  }
  const packageFamilyName = inferPackageFamilyName(entry.executablePath).toLocaleLowerCase();
  if (packageFamilyName) {
    const byFamily = apps.filter((app) => app.packageFamilyName.toLocaleLowerCase() === packageFamilyName);
    if (byFamily.length === 1) return byFamily[0];
    const normalizedProcessName = entry.processName.trim().toLocaleLowerCase();
    const byProcessName = byFamily.find((app) => app.processName.trim().toLocaleLowerCase() === normalizedProcessName);
    if (byProcessName) return byProcessName;
    const normalizedName = entry.name.trim().toLocaleLowerCase();
    return byFamily.find((app) => app.name.trim().toLocaleLowerCase() === normalizedName);
  }
  return undefined;
}

export class WindowsStoreAppService {
  private cached: { at: number; apps: WindowsStoreAppIdentity[] } | null = null;
  private inFlight: Promise<WindowsStoreAppIdentity[]> | null = null;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;

  constructor(private readonly options: WindowsStoreAppServiceOptions) {
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
  }

  async list(force = false) {
    if (!force && this.cached && this.now() - this.cached.at < this.cacheTtlMs) return this.cached.apps;
    if (!this.inFlight) {
      this.inFlight = this.options.runPowerShell(windowsStoreDiscoveryScript())
        .then(parseWindowsStoreApps)
        .then((apps) => {
          this.cached = { at: this.now(), apps };
          return apps;
        })
        .finally(() => { this.inFlight = null; });
    }
    return this.inFlight;
  }

  async resolve(entry: Pick<AppEntry, "name" | "executablePath" | "processName" | "appUserModelId">) {
    const force = Boolean(inferPackageFamilyName(entry.executablePath));
    return findWindowsStoreApp(entry, await this.list(force));
  }
}

export function windowsStoreDiscoveryScript() {
  return `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$packages = @{}
Get-AppxPackage -ErrorAction SilentlyContinue | ForEach-Object { $packages[[string]$_.PackageFamilyName] = $_ }
$rows = foreach ($startApp in (Get-StartApps)) {
  $aumid = [string]$startApp.AppID
  $separator = $aumid.IndexOf('!')
  if ($separator -le 0 -or $separator -ge ($aumid.Length - 1)) { continue }
  $family = $aumid.Substring(0, $separator)
  $applicationId = $aumid.Substring($separator + 1)
  $package = $packages[$family]
  if ($null -eq $package) { continue }
  $executablePath = ''
  $processName = ''
  try {
    $manifest = Get-AppxPackageManifest -Package $package -ErrorAction Stop
    $application = @($manifest.Package.Applications.Application) | Where-Object { [string]$_.Id -eq $applicationId } | Select-Object -First 1
    $relativeExecutable = [string]$application.Executable
    if (-not [string]::IsNullOrWhiteSpace($relativeExecutable) -and -not $relativeExecutable.StartsWith('$')) {
      $candidatePath = Join-Path ([string]$package.InstallLocation) $relativeExecutable
      if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
        $executablePath = [IO.Path]::GetFullPath($candidatePath)
        $processName = [IO.Path]::GetFileNameWithoutExtension($executablePath)
      }
    }
  } catch {}
  [PSCustomObject]@{
    name = [string]$startApp.Name
    appUserModelId = $aumid
    packageFamilyName = $family
    executablePath = $executablePath
    processName = $processName
  }
}
@($rows) | ConvertTo-Json -Compress`;
}
