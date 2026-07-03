import { basename, extname } from "node:path";
import type { AppEntry, AppRunningStatus } from "../shared/types.js";

export type TasklistProcessRow = {
  name: string;
  pid: number;
};

const normalizeName = (value: string) => basename(value, extname(value)).trim().toLowerCase();

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

export function parseTasklistCsv(output: string): TasklistProcessRow[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("INFO:"))
    .map((line) => {
      const cells = parseCsvLine(line);
      return { name: cells[0] ?? "", pid: Number(cells[1]) };
    })
    .filter((row) => row.name && Number.isSafeInteger(row.pid) && row.pid > 0);
}

export function buildManagedRunningStatus(apps: AppEntry[], rows: TasklistProcessRow[]): AppRunningStatus[] {
  const pidsByName = new Map<string, number[]>();
  const allPids = new Set<number>();
  for (const row of rows) {
    allPids.add(row.pid);
    const name = normalizeName(row.name);
    if (!name) continue;
    const existing = pidsByName.get(name) ?? [];
    existing.push(row.pid);
    pidsByName.set(name, existing);
  }

  return apps.map((app) => {
    const names = new Set([
      normalizeName(app.processName),
      normalizeName(app.executablePath),
      ...(app.processAliases ?? []).map(normalizeName)
    ].filter(Boolean));
    const pids = new Set<number>();
    for (const name of names) {
      for (const pid of pidsByName.get(name) ?? []) pids.add(pid);
    }
    for (const pid of [app.launchedPid, ...(app.associatedPids ?? [])]) {
      if (pid && allPids.has(pid)) pids.add(pid);
    }
    return { appId: app.id, isRunning: pids.size > 0, pids: [...pids].sort((a, b) => a - b) };
  });
}
