import { createRequire } from "node:module";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = resolve(root, "release");
const unpacked = resolve(release, "win-unpacked");
const version = require(resolve(root, "package.json")).version;
const mebibyte = 1024 * 1024;
const helperBudget = 20 * mebibyte;
const artifactBudget = 110 * mebibyte;

function verifyFile(path, budget, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const size = statSync(path).size;
  if (size > budget) {
    throw new Error(`${label} is ${(size / mebibyte).toFixed(2)} MiB; budget is ${(budget / mebibyte).toFixed(0)} MiB`);
  }
  return size;
}

const localesDir = resolve(unpacked, "locales");
const locales = readdirSync(localesDir).filter((name) => name.endsWith(".pak")).sort();
const expectedLocales = ["en-US.pak", "zh-CN.pak"];
if (JSON.stringify(locales) !== JSON.stringify(expectedLocales)) {
  throw new Error(`Unexpected Electron locales: ${locales.join(", ") || "none"}`);
}

const asarPath = resolve(unpacked, "resources/app.asar");
const asarEntries = listPackage(asarPath).map((entry) => entry.replaceAll("\\", "/"));
if (asarEntries.some((entry) => entry === "/node_modules" || entry.startsWith("/node_modules/"))) {
  throw new Error("Packaged ASAR contains duplicate development dependencies");
}

const helperSize = verifyFile(
  resolve(unpacked, "resources/window-focus-helper/win-x64/window-focus-helper.exe"),
  helperBudget,
  "Window helper"
);
const setupSize = verifyFile(resolve(release, `Start-Engineer-Setup-${version}.exe`), artifactBudget, "Setup");
const portableSize = verifyFile(resolve(release, `Start-Engineer-Portable-${version}.exe`), artifactBudget, "Portable app");

console.log([
  `Package footprint verified:`,
  `helper ${(helperSize / mebibyte).toFixed(2)} MiB,`,
  `setup ${(setupSize / mebibyte).toFixed(2)} MiB,`,
  `portable ${(portableSize / mebibyte).toFixed(2)} MiB,`,
  `locales ${locales.join(" + ")}.`
].join(" "));
