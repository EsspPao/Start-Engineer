import { win32 } from "node:path";
import type { AppEntry } from "../shared/types.js";

export function normalizeProcessName(value: string) {
  return win32.basename(value).replace(/\.exe$/i, "").trim().toLowerCase();
}

/** A remembered PID is only a hint; it must still belong to this application. */
export function isAssociatedProcess(app: AppEntry, process: { name: string; path?: string }) {
  const name = normalizeProcessName(process.name);
  const names = [app.processName, app.executablePath, ...(app.processAliases ?? [])].map(normalizeProcessName);
  if (name && names.includes(name)) return true;
  if (!process.path || !win32.isAbsolute(process.path) || !win32.isAbsolute(app.executablePath)) return false;
  const directory = win32.dirname(win32.normalize(app.executablePath)).toLowerCase();
  if (directory === win32.parse(directory).root) return false;
  return win32.normalize(process.path).toLowerCase().startsWith(`${directory}\\`);
}

/** Background SDK cleanup alone is not evidence that the game is still running. */
export function contributesToRunningStatus(app: AppEntry, process: { name: string; path?: string }) {
  if (normalizeProcessName(app.executablePath) !== "wuthering waves") return true;
  return normalizeProcessName(process.name) !== "krsdkexternal";
}
