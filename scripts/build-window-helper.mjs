import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(root, "native/window-focus-helper/window-focus-helper.csproj");
const output = resolve(root, "dist-native/window-focus-helper/win-x64");

mkdirSync(output, { recursive: true });

const args = [
  "publish",
  project,
  "-c",
  "Release",
  "-r",
  "win-x64",
  "--self-contained",
  "false",
  "-o",
  output
];

const child = spawn("dotnet", args, {
  cwd: root,
  stdio: "inherit",
  shell: false
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
