import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helper = resolve(process.argv[2] || resolve(root, "dist-native/window-focus-helper/win-x64/window-focus-helper.exe"));

if (process.platform !== "win32") {
  console.log("Window helper smoke test skipped outside Windows.");
  process.exit(0);
}
if (!existsSync(helper)) throw new Error(`Window helper does not exist: ${helper}`);

function run(command, input = "") {
  const result = spawnSync(helper, [command], {
    encoding: "utf8",
    input,
    timeout: 30_000,
    windowsHide: true
  });
  if (result.error?.code === "EPERM" && process.env.CI !== "true") {
    console.warn("Window helper smoke test was blocked by the local execution policy; CI will enforce it.");
    process.exit(0);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || `exit ${result.status}`}`);
  try {
    return JSON.parse(result.stdout || "null");
  } catch {
    throw new Error(`${command} returned invalid JSON`);
  }
}

const privilege = run("is-elevated");
if (typeof privilege?.isElevated !== "boolean") throw new Error("is-elevated returned an invalid result");

const scan = run("scan", "[]");
if (!Array.isArray(scan?.finalCandidates)) throw new Error("scan returned an invalid result");

const focus = run("focus", JSON.stringify({ handle: 0, expectedPids: [] }));
if (typeof focus?.focused !== "boolean") throw new Error("focus returned an invalid result");

const snapshot = run("snapshot", JSON.stringify({ mode: "managed", managedNames: ["node"], managedPids: [process.pid] }));
if (!Array.isArray(snapshot)) throw new Error("snapshot returned an invalid result");

const shortcutRoots = [
  process.env.APPDATA && resolve(process.env.APPDATA, "Microsoft/Windows/Start Menu/Programs"),
  process.env.ProgramData && resolve(process.env.ProgramData, "Microsoft/Windows/Start Menu/Programs")
].filter(Boolean).map((path) => ({ path, source: "smoke" }));
const shortcuts = run("shortcuts", JSON.stringify({ roots: shortcutRoots, paths: [], source: "smoke" }));
if (!Array.isArray(shortcuts)) throw new Error("shortcuts returned an invalid result");

const icon = run("icon", JSON.stringify({ path: resolve(root, "package.json"), pixelSize: 64 }));
const png = Buffer.from(icon?.pngBase64 || "", "base64");
if (!icon?.ok || png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("icon returned an invalid PNG");
}

const launcher = run("launch", JSON.stringify({
  executablePath: process.env.ComSpec,
  workingDirectory: process.env.TEMP,
  argumentLine: "/d /c exit 0",
  waitForExit: true,
  hidden: true
}));
if (!launcher?.ok || launcher.exitCode !== 0) throw new Error("launch returned an invalid result");

const runtimeInput = [
  { id: 1, command: "ping", payload: {} },
  { id: 2, command: "is-elevated", payload: {} },
  { id: 3, command: "snapshot", payload: { mode: "managed", managedNames: ["node"], managedPids: [process.pid] } }
].map((request) => JSON.stringify(request)).join("\n") + "\n";
const runtime = spawnSync(helper, ["runtime"], {
  encoding: "utf8",
  input: runtimeInput,
  timeout: 30_000,
  windowsHide: true
});
if (runtime.error) throw runtime.error;
if (runtime.status !== 0) throw new Error(`runtime failed: ${runtime.stderr || `exit ${runtime.status}`}`);
const responses = runtime.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (responses.length !== 3 || responses.some((response) => response.ok !== true)) {
  throw new Error("runtime returned an invalid response sequence");
}

console.log(`Window helper smoke test passed (${shortcuts.length} shortcuts checked).`);
