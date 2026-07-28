import { execFile } from "node:child_process";
import { join } from "node:path";
import { normalizeNativeLaunchResult, type NativeHelperCommand, type NativeLaunchRequest } from "./native-helper.js";
import { buildTaskkillArgs, normalizePids } from "./process-termination.js";

const protectedProcessNames = new Set([
  "system",
  "system idle process",
  "registry",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "services.exe",
  "lsass.exe",
  "winlogon.exe",
  "dwm.exe"
]);

type ProcessControlOptions = {
  ownProcessIds: () => ReadonlySet<number>;
  runNativeHelper: (command: NativeHelperCommand, payload: unknown, timeoutMs?: number) => Promise<string>;
  elevatedTerminationHost?: {
    start: () => Promise<void>;
    terminate: (pids: number[]) => Promise<void>;
  };
  systemRoot?: () => string;
};

export class ProcessControlService {
  constructor(private readonly options: ProcessControlOptions) {}

  getTerminationBlockReason(name: string, pids: number[]) {
    if (protectedProcessNames.has(name.toLowerCase())) return "Windows 关键进程受保护";
    const ownIds = this.options.ownProcessIds();
    if (pids.some((pid) => ownIds.has(pid))) return "不能结束 Start Engineer 自身进程";
    return undefined;
  }

  runPowerShell(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, maxBuffer: 1024 * 1024 * 20 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`${String(stderr || error.message).trim()}${error.code !== undefined ? ` (exit ${error.code})` : ""}`));
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  runTaskkill(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("taskkill.exe", args, { windowsHide: true }, (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || error.message).trim()));
          return;
        }
        resolve();
      });
    });
  }

  async terminateElevatedPids(pids: number[]) {
    const normalized = normalizePids(pids);
    if (!normalized.length) return;
    if (this.options.elevatedTerminationHost) {
      try {
        await this.options.elevatedTerminationHost.terminate(normalized);
      } catch (reason) {
        if (!hasErrorCode(reason, "ELEVATION_REQUIRED")) throw reason;
        await this.options.elevatedTerminationHost.start();
        await this.options.elevatedTerminationHost.terminate(normalized);
      }
      return;
    }
    const args = buildTaskkillArgs(normalized);
    let value: unknown;
    try {
      const systemDirectory = join(this.options.systemRoot?.() || process.env.SystemRoot || "C:\\Windows", "System32");
      value = JSON.parse(await this.options.runNativeHelper("launch", {
        executablePath: join(systemDirectory, "taskkill.exe"),
        workingDirectory: systemDirectory,
        arguments: args,
        elevated: true,
        waitForExit: true,
        hidden: true
      } satisfies NativeLaunchRequest, 120_000));
    } catch (reason) {
      if (reason instanceof Error && /native helper unavailable/i.test(reason.message)) {
        await this.runElevatedTaskkillWithPowerShell(args);
        return;
      }
      throw reason;
    }
    const result = normalizeNativeLaunchResult(value);
    if (!result.ok) {
      if (result.errorCode === 1223) throw Object.assign(new Error("已取消管理员授权，未能结束应用进程"), { code: "ELEVATION_CANCELLED" });
      throw new Error(`管理员结束进程失败${result.errorCode ? `（错误 ${result.errorCode}）` : ""}`);
    }
    if (result.exitCode && result.exitCode !== 0) throw new Error(`taskkill exited with code ${result.exitCode}`);
  }

  private async runElevatedTaskkillWithPowerShell(args: string[]) {
    const encodedArgs = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
    const script = `
$arguments = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedArgs}')) | ConvertFrom-Json
try {
  $process = Start-Process -FilePath 'taskkill.exe' -ArgumentList ([string[]]$arguments) -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
} catch {
  if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.Message -match 'cancel|取消') { exit 1223 }
  throw
}
`;
    try {
      await this.runPowerShell(script);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/1223|cancel|取消/i.test(message)) throw Object.assign(new Error(message), { code: "ELEVATION_CANCELLED" });
      throw reason;
    }
  }
}

function hasErrorCode(reason: unknown, code: string) {
  return reason instanceof Error && "code" in reason && reason.code === code;
}
