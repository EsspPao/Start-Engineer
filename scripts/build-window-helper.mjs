import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(root, "native/window-focus-helper/window-focus-helper.csproj");
const output = resolve(root, "dist-native/window-focus-helper/win-x64");
const appVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const numericVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(appVersion);

if (!numericVersion) throw new Error(`Invalid application version: ${appVersion}`);
const fileVersion = `${numericVersion[1]}.${numericVersion[2]}.${numericVersion[3]}.0`;

rmSync(output, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
mkdirSync(output, { recursive: true });

const args = [
  "publish",
  project,
  "-c",
  "Release",
  "-r",
  "win-x64",
  "-p:DebugSymbols=false",
  "-p:DebugType=None",
  `-p:Version=${appVersion}`,
  `-p:InformationalVersion=${appVersion}`,
  `-p:AssemblyVersion=${fileVersion}`,
  `-p:FileVersion=${fileVersion}`,
  "-o",
  output
];

const child = spawn("dotnet", args, {
  cwd: root,
  stdio: "inherit",
  shell: false
});

child.on("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }

  const executable = resolve(output, "window-focus-helper.exe");
  const debugSymbols = readdirSync(output).filter((name) => name.toLowerCase().endsWith(".pdb"));
  if (!existsSync(executable) || debugSymbols.length > 0) {
    console.error("Native helper publish output is incomplete or contains debug symbols.");
    process.exitCode = 1;
    return;
  }

  const smoke = spawnSync(process.execPath, [resolve(root, "scripts/smoke-window-helper.mjs"), executable], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true
  });
  if (smoke.stdout) process.stdout.write(smoke.stdout);
  if (smoke.status !== 0 || smoke.error) {
    console.error(`Native helper smoke check failed: ${smoke.stderr || smoke.error?.message || "invalid response"}`);
    process.exitCode = 1;
  }
});

child.on("error", (error) => {
  console.error(`Could not start dotnet publish: ${error.message}`);
  process.exitCode = 1;
});
