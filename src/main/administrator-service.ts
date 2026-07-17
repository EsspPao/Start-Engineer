import { execFile, execFileSync, spawn } from "node:child_process";
import { dirname } from "node:path";
import type { AppPreferences } from "../shared/types.js";
import { buildRestartRequest } from "./administrator-launch.js";
import { normalizeNativeLaunchResult, runNativeHelper, runNativeHelperSync, type NativeLaunchRequest, type NativeLaunchResult } from "./native-helper.js";

type RestartRequest = ReturnType<typeof buildRestartRequest>;

type AdministratorServiceOptions = {
  execPath: string;
  portableExecutable?: string;
  loadPreferences: () => AppPreferences;
  releaseSingleInstanceLock: () => void;
  requestSingleInstanceLock: () => boolean;
  beforeQuit: () => void;
  quit: () => void;
};

export class AdministratorService {
  constructor(private readonly options: AdministratorServiceOptions) {}

  detectPrivileges() {
    if (process.platform !== "win32") return false;
    try {
      const result = JSON.parse(runNativeHelperSync("is-elevated", {}, 5000)) as { isElevated?: boolean };
      if (typeof result.isElevated === "boolean") return result.isElevated;
    } catch { /* Fall back to PowerShell when the native helper is unavailable. */ }
    try {
      const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      return result.trim().toLowerCase() === "true";
    } catch {
      return false;
    }
  }

  async restartWithConfiguredPrivileges() {
    const request = this.configuredRestartRequest();
    this.options.releaseSingleInstanceLock();
    try {
      await this.launch(request);
    } catch (reason) {
      this.options.requestSingleInstanceLock();
      throw reason;
    }
    this.options.beforeQuit();
    setTimeout(this.options.quit, 150);
  }

  launchElevatedSynchronously(request: RestartRequest) {
    try {
      const result = normalizeNativeLaunchResult(JSON.parse(runNativeHelperSync("launch", toNativeLaunchRequest(request), 120_000)));
      ensureNativeLaunchSucceeded(result);
      return;
    } catch (reason) {
      if (reason instanceof Error && ("code" in reason || !/unavailable|timed out|invalid/i.test(reason.message))) throw reason;
    }
    const script = elevatedPowerShellScript(request);
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", powershellEncoded(script)], { windowsHide: true, timeout: 120000 });
  }

  private configuredRestartRequest() {
    return buildRestartRequest(this.options.execPath, this.options.portableExecutable, this.options.loadPreferences().runAsAdministrator);
  }

  private async launch(request: RestartRequest) {
    if (!request.elevated) {
      spawn("explorer.exe", [request.executablePath, ...request.args], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return;
    }
    let raw: string;
    try {
      raw = await runNativeHelper("launch", toNativeLaunchRequest(request), 120_000);
    } catch (reason) {
      if (nativeHelperWasUnavailable(reason)) return launchElevatedWithPowerShell(request);
      throw reason;
    }
    ensureNativeLaunchSucceeded(normalizeNativeLaunchResult(JSON.parse(raw)));
  }
}

export function toNativeLaunchRequest(request: RestartRequest): NativeLaunchRequest {
  return { executablePath: request.executablePath, workingDirectory: dirname(request.executablePath), arguments: request.args, elevated: request.elevated };
}

export function launchErrorMessage(errorCode?: number) {
  if (errorCode === 2 || errorCode === 3) return "程序或工作目录不存在。";
  if (errorCode === 5) return "没有权限启动该程序。";
  if (errorCode === 267) return "应用配置的工作目录无效。";
  return "启动失败，请检查程序路径和启动参数。";
}

function ensureNativeLaunchSucceeded(result: NativeLaunchResult) {
  if (result.ok) return;
  if (result.errorCode === 1223) throw Object.assign(new Error("管理员授权已取消"), { code: "ELEVATION_CANCELLED" });
  throw new Error(launchErrorMessage(result.errorCode));
}

function nativeHelperWasUnavailable(reason: unknown) {
  return reason instanceof Error && /native helper unavailable/i.test(reason.message);
}

function powershellEncoded(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function elevatedPowerShellScript(request: RestartRequest) {
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  return `$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\nStart-Process -FilePath ([string]$request.executablePath) -ArgumentList ([string[]]$request.args) -Verb RunAs -ErrorAction Stop`;
}

function launchElevatedWithPowerShell(request: RestartRequest) {
  return new Promise<void>((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", powershellEncoded(elevatedPowerShellScript(request))], { windowsHide: true }, (error) => error ? reject(new Error("管理员授权已取消或启动失败")) : resolve());
  });
}
