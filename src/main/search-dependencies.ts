import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { get } from "node:https";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import type { AppPreferences, SearchDependencyStatus } from "../shared/types.js";

export const EVERYTHING_PORTABLE_URL = "https://www.voidtools.com/Everything-1.4.1.1032.x64.zip";
export const EVERYTHING_ES_URL = "https://www.voidtools.com/ES-1.1.0.30.x64.zip";

type Exists = (path: string) => boolean;

export function getManagedEverythingPaths(userDataPath: string) {
  const root = join(userDataPath, "dependencies", "everything");
  return {
    root,
    tempDir: join(userDataPath, "dependencies", ".tmp"),
    everythingPath: join(root, "Everything.exe"),
    everythingCliPath: join(root, "ES.exe")
  };
}

export function buildEverythingDownloadPlan(userDataPath: string) {
  const paths = getManagedEverythingPaths(userDataPath);
  return {
    everything: {
      url: EVERYTHING_PORTABLE_URL,
      tempZip: join(paths.tempDir, "Everything-1.4.1.1032.x64.zip"),
      finalDir: paths.root
    },
    es: {
      url: EVERYTHING_ES_URL,
      tempZip: join(paths.tempDir, "ES-1.1.0.30.x64.zip"),
      finalDir: paths.root
    }
  };
}

function pathCandidates(pathEnv?: string) {
  return (pathEnv ?? process.env.PATH ?? "")
    .split(";")
    .filter(Boolean)
    .map((entry) => join(entry, "ES.exe"));
}

export function getSearchDependencyStatus(preferences: Partial<AppPreferences>, userDataPath: string, options: { exists?: Exists; pathEnv?: string; programFiles?: string; programFilesX86?: string } = {}): SearchDependencyStatus {
  const exists = options.exists ?? existsSync;
  if (preferences.everythingCliPath && exists(preferences.everythingCliPath)) {
    return { state: "ready", everythingCliPath: preferences.everythingCliPath, everythingPath: preferences.everythingManagedPath };
  }

  const systemCandidates = [
    ...pathCandidates(options.pathEnv),
    join(options.programFiles ?? process.env.ProgramFiles ?? "C:\\Program Files", "Everything", "ES.exe"),
    join(options.programFilesX86 ?? process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Everything", "ES.exe")
  ];
  const systemCli = systemCandidates.find((candidate) => exists(candidate));
  if (systemCli) return { state: "ready", everythingCliPath: systemCli };

  const managed = getManagedEverythingPaths(userDataPath);
  if (exists(managed.everythingCliPath) && exists(managed.everythingPath)) {
    return { state: "ready", everythingPath: managed.everythingPath, everythingCliPath: managed.everythingCliPath };
  }

  return { state: "missing", message: "尚未准备 Everything 搜索依赖" };
}

export function downloadFile(url: string, target: string, onProgress?: (downloadedBytes: number, totalBytes?: number) => void): Promise<void> {
  mkdirSync(dirname(target), { recursive: true });
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, target, onProgress).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`下载失败：HTTP ${response.statusCode ?? "unknown"}`));
        return;
      }
      const total = Number(response.headers["content-length"] ?? 0) || undefined;
      let downloaded = 0;
      const output = createWriteStream(target);
      response.on("data", (chunk: Buffer) => {
        downloaded += chunk.length;
        onProgress?.(downloaded, total);
      });
      response.pipe(output);
      output.on("finish", () => output.close(() => resolve()));
      output.on("error", reject);
    });
    request.on("error", reject);
  });
}

export function expandZip(zipPath: string, destination: string): Promise<void> {
  mkdirSync(destination, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`], { windowsHide: true }, (error) => error ? reject(error) : resolve());
  });
}

export function clearTempDependencyDir(userDataPath: string) {
  const { tempDir } = getManagedEverythingPaths(userDataPath);
  rmSync(tempDir, { recursive: true, force: true });
}
