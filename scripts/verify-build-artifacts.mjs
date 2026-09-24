import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = ["dist/index.html", "dist-electron/main/main.js", "dist-electron/preload/preload.cjs"];
const forbiddenName = /\.(?:test|spec)\.(?:c?js|mjs)(?:\.map)?$/i;

const files = [];
const collectFiles = (directory) => {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
};

for (const requiredFile of requiredFiles) {
  if (!existsSync(resolve(projectRoot, requiredFile))) {
    throw new Error(`Required build artifact is missing: ${requiredFile}`);
  }
}

collectFiles(resolve(projectRoot, "dist"));
collectFiles(resolve(projectRoot, "dist-electron"));

const forbiddenFiles = files
  .filter((path) => forbiddenName.test(path))
  .map((path) => relative(projectRoot, path).replaceAll("\\", "/"));

if (forbiddenFiles.length > 0) {
  throw new Error(`Test artifacts must not be packaged:\n${forbiddenFiles.join("\n")}`);
}

const sourceMaps = files.filter((path) => extname(path).toLowerCase() === ".map");
console.log(`Verified ${files.length} build files; no test artifacts found (${sourceMaps.length} source maps).`);

collectFiles(resolve(projectRoot, "dist-native"));
const digest = createHash("sha256");
for (const path of files.filter((path) => !path.endsWith("build-info.json")).sort()) {
  digest.update(relative(projectRoot, path).replaceAll("\\", "/"));
  digest.update(readFileSync(path));
}
writeFileSync(resolve(projectRoot, "dist-electron/build-info.json"), JSON.stringify({ buildId: digest.digest("hex").slice(0, 16) }));
