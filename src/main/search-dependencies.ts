import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { get } from "node:https";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import type { AppPreferences, SearchDependencyStatus } from "../shared/types.js";
import { runNativeHelper } from "./native-helper.js";

export const EVERYTHING_PORTABLE_URL = "https://www.voidtools.com/Everything-1.4.1.1032.x64.zip";
export const EVERYTHING_PORTABLE_SHA256 = "698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c";
export const EVERYTHING_ES_URL = "https://www.voidtools.com/ES-1.1.0.37.x64.zip";
export const EVERYTHING_ES_SHA256 = "7a57670d9152068d05876c58858c82fe6d3915a9df2c819f4de8801e2929d3a7";

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
      sha256: EVERYTHING_PORTABLE_SHA256,
      tempZip: join(paths.tempDir, "Everything-1.4.1.1032.x64.zip"),
      finalDir: paths.root
    },
    es: {
      url: EVERYTHING_ES_URL,
      sha256: EVERYTHING_ES_SHA256,
      tempZip: join(paths.tempDir, "ES-1.1.0.37.x64.zip"),
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

function expandZipWithPowerShell(zipPath: string, destination: string): Promise<void> {
  mkdirSync(destination, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`], { windowsHide: true }, (error) => error ? reject(error) : resolve());
  });
}

export async function verifyFileSha256(path: string, expectedHash: string): Promise<void> {
  const actualHash = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actualHash !== expectedHash.toLowerCase()) throw new Error("下载文件安全校验失败，请重试或手动选择官方 ES.exe");
}

export async function expandZip(zipPath: string, destination: string): Promise<void> {
  mkdirSync(destination, { recursive: true });
  try {
    await runNativeHelper("extract", { zipPath, destination }, 120_000);
  } catch {
    await expandZipWithPowerShell(zipPath, destination);
  }
}

export function clearTempDependencyDir(userDataPath: string) {
  const { tempDir } = getManagedEverythingPaths(userDataPath);
  rmSync(tempDir, { recursive: true, force: true });
}
