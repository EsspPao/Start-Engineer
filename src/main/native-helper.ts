import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { ProcessSnapshot } from "./runtime-monitor.js";

export type NativeHelperCommand = "scan" | "focus" | "launch" | "is-elevated" | "snapshot" | "extract" | "shortcuts" | "icon";
export type NativeRuntimeCommand = "launch" | "is-elevated" | "snapshot" | "ping";
export type NativeLaunchRequest = {
  executablePath: string;
  appUserModelId?: string;
  workingDirectory?: string;
  argumentLine?: string;
  arguments?: string[];
  elevated?: boolean;
  waitForExit?: boolean;
  hidden?: boolean;
};
export type NativeLaunchResult = {
  ok: boolean;
  pid?: number;
  errorCode?: number;
  exitCode?: number;
  detail?: string;
};

type RuntimeResponse = { id: number; ok: boolean; result?: unknown; error?: string };
type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };

const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packagedResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

export function resolveNativeHelperPath() {
  if (process.platform !== "win32") return "";
  const packaged = packagedResourcesPath ? join(packagedResourcesPath, "window-focus-helper", "win-x64", "window-focus-helper.exe") : "";
  if (packaged && existsSync(packaged)) return packaged;
  const development = join(appRoot, "dist-native", "window-focus-helper", "win-x64", "window-focus-helper.exe");
  return existsSync(development) ? development : "";
}

export function runNativeHelper(command: NativeHelperCommand, payload: unknown, timeoutMs = 20_000): Promise<string> {
  const executable = resolveNativeHelperPath();
  if (!executable) return Promise.reject(new Error("native helper unavailable"));
  return new Promise((resolve, reject) => {
    const child = execFile(executable, [command], { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${String(stderr || error.message).trim()}${error.code !== undefined ? ` (exit ${error.code})` : ""}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin?.end(JSON.stringify(payload ?? {}));
  });
}

export function runNativeHelperSync(command: NativeHelperCommand, payload: unknown, timeoutMs = 20_000) {
  const executable = resolveNativeHelperPath();
  if (!executable) throw new Error("native helper unavailable");
  return execFileSync(executable, [command], {
    input: JSON.stringify(payload ?? {}),
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 20
  });
}

export function normalizeNativeLaunchResult(value: unknown): NativeLaunchResult {
  if (!value || typeof value !== "object") throw new Error("native helper returned an invalid launch result");
  const raw = value as Record<string, unknown>;
  return {
    ok: raw.ok === true,
    ...(typeof raw.pid === "number" ? { pid: raw.pid } : {}),
    ...(typeof raw.errorCode === "number" ? { errorCode: raw.errorCode } : {}),
    ...(typeof raw.exitCode === "number" ? { exitCode: raw.exitCode } : {}),
    ...(typeof raw.detail === "string" ? { detail: raw.detail } : {})
  };
}

export function normalizeNativeSnapshots(value: unknown): ProcessSnapshot[] {
  if (!Array.isArray(value)) throw new Error("native helper returned an invalid process snapshot");
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.pid !== "number" || !Number.isSafeInteger(raw.pid) || raw.pid <= 0) return [];
    return [{
      pid: raw.pid,
      parentPid: typeof raw.parentPid === "number" ? raw.parentPid : 0,
      name: typeof raw.name === "string" ? raw.name : "",
      path: typeof raw.path === "string" ? raw.path : "",
      cpuSeconds: typeof raw.cpuSeconds === "number" && Number.isFinite(raw.cpuSeconds) ? raw.cpuSeconds : 0,
      memoryBytes: typeof raw.memoryBytes === "number" && Number.isFinite(raw.memoryBytes) ? raw.memoryBytes : 0,
      readBytes: typeof raw.readBytes === "number" && Number.isFinite(raw.readBytes) ? raw.readBytes : 0,
      writeBytes: typeof raw.writeBytes === "number" && Number.isFinite(raw.writeBytes) ? raw.writeBytes : 0
    }];
  });
}

export class NativeRuntimeHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  async request<T>(command: NativeRuntimeCommand, payload: unknown = {}, timeoutMs = 10_000): Promise<T> {
    const child = this.ensureStarted();
    const id = this.nextId++;
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`native helper ${command} timed out`));
        this.stop();
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      child.stdin.write(`${JSON.stringify({ id, command, payload })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
    this.rejectPending(new Error("native helper stopped"));
  }

  private ensureStarted() {
    if (this.child && !this.child.killed) return this.child;
    const executable = resolveNativeHelperPath();
    if (!executable) throw new Error("native helper unavailable");
    const child = spawn(executable, ["runtime"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    child.once("error", (error) => {
      if (this.child === child) this.child = null;
      this.rejectPending(error);
    });
    child.once("exit", (code) => {
      if (this.child === child) this.child = null;
      this.rejectPending(new Error(`native helper exited${code === null ? "" : ` with code ${code}`}`));
    });
    return child;
  }

  private handleLine(line: string) {
    let response: RuntimeResponse;
    try {
      response = JSON.parse(line) as RuntimeResponse;
    } catch {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error || "native helper request failed"));
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
