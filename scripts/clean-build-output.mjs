import { rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectories = ["dist", "dist-electron", "dist-native"];

for (const directory of outputDirectories) {
  const target = resolve(projectRoot, directory);
  const relativeTarget = relative(projectRoot, target);
  if (!relativeTarget || isAbsolute(relativeTarget) || relativeTarget.startsWith("..")) {
    throw new Error(`Refusing to clean a path outside the project: ${target}`);
  }

  rmSync(target, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
}

console.log(`Cleaned ${outputDirectories.join(" and ")}.`);
