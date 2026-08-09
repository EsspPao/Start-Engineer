import { existsSync, readdirSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const releaseDirectory = resolve(projectRoot, "release");
const fixedBuildFiles = new Set([
  "builder-debug.yml",
  "builder-effective-config.yaml",
  "latest.yml",
  "SHA256SUMS.txt"
]);
const versionedArtifactPattern = /^Start-Engineer-(?:Setup|Portable)-.+\.exe(?:\.blockmap)?$/;

if (!existsSync(releaseDirectory)) {
  console.log("Release directory does not exist; nothing to clean.");
  process.exit(0);
}

const removed = [];
for (const entry of readdirSync(releaseDirectory, { withFileTypes: true })) {
  const isKnownDirectory = entry.isDirectory() && entry.name.startsWith("win-unpacked");
  const isKnownFile = entry.isFile()
    && (fixedBuildFiles.has(entry.name) || versionedArtifactPattern.test(entry.name));
  if (!isKnownDirectory && !isKnownFile) {
    continue;
  }

  const target = resolve(releaseDirectory, entry.name);
  const relativeTarget = relative(releaseDirectory, target);
  if (!relativeTarget || isAbsolute(relativeTarget) || relativeTarget.startsWith("..")) {
    throw new Error(`Refusing to clean a path outside the release directory: ${target}`);
  }

  rmSync(target, { force: true, recursive: entry.isDirectory(), maxRetries: 3, retryDelay: 100 });
  removed.push(entry.name);
}

console.log(removed.length > 0
  ? `Cleaned stale release outputs: ${removed.join(", ")}.`
  : "No stale release outputs found.");
