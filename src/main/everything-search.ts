import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { EverythingSearchResult } from "../shared/types.js";

export function buildEverythingArgs(query: string, limit = 80) {
  return ["-n", String(limit), "-csv", "-name", "-path-column", "-size", "-date-modified", query.trim()];
}

export function decodeEverythingOutput(output: Buffer | string) {
  if (typeof output === "string") return output;
  const utf8 = output.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("gb18030").decode(output);
  } catch {
    return utf8;
  }
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function joinWindowsPath(parent: string, name: string) {
  return parent.endsWith("\\") || parent.endsWith("/") ? `${parent}${name}` : `${parent}\\${name}`;
}

export function parseEverythingCsv(csv: string): EverythingSearchResult[] {
  return csv
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(1)
    .map((line) => {
      const [name = "", parent = "", size = "", modifiedAt = ""] = parseCsvLine(line);
      const numericSize = Number(size);
      return {
        name,
        path: joinWindowsPath(parent, name),
        kind: size.trim() ? "file" : "folder",
        ...(Number.isFinite(numericSize) && size.trim() ? { sizeBytes: numericSize } : {}),
        ...(modifiedAt ? { modifiedAt } : {})
      } satisfies EverythingSearchResult;
    });
}

export function findEverythingCli(configuredPath?: string) {
  const candidates = [
    configuredPath,
    ...((process.env.PATH ?? "").split(";").map((entry) => entry ? `${entry}\\ES.exe` : "")),
    process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Everything\\ES.exe` : "",
    process.env["ProgramFiles(x86)"] ? `${process.env["ProgramFiles(x86)"]}\\Everything\\ES.exe` : ""
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate));
}

export function searchEverything(query: string, options: { cliPath?: string; limit?: number; timeoutMs?: number } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return Promise.resolve([]);
  const cliPath = findEverythingCli(options.cliPath);
  if (!cliPath) return Promise.reject(new Error("未找到 Everything 命令行工具 ES.exe，请安装 Everything 或在设置中选择 ES.exe。"));
  if (basename(cliPath).toLowerCase() !== "es.exe") return Promise.reject(new Error("请选择 Everything 的 ES.exe 命令行工具。"));
  return new Promise<EverythingSearchResult[]>((resolve, reject) => {
    execFile(cliPath, buildEverythingArgs(trimmed, options.limit ?? 80), { encoding: "buffer", windowsHide: true, timeout: options.timeoutMs ?? 3000, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(decodeEverythingOutput(stderr).trim() || "Everything 搜索失败，请确认 Everything 已安装并正在运行。"));
        return;
      }
      resolve(parseEverythingCsv(decodeEverythingOutput(stdout)));
    });
  });
}
