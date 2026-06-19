import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const configFiles = ["apps.json", "groups.json", "preferences.json"];

function copyDirectory(sourceDir: string, targetDir: string) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const source = join(sourceDir, entry);
    const target = join(targetDir, entry);
    if (statSync(source).isDirectory()) {
      copyDirectory(source, target);
    } else {
      copyFileSync(source, target);
    }
  }
}

export function migrateLegacyUserData(currentDir: string, legacyDir: string) {
  if (!existsSync(legacyDir) || legacyDir === currentDir) return;
  mkdirSync(currentDir, { recursive: true });
  for (const file of configFiles) {
    const source = join(legacyDir, file);
    const target = join(currentDir, file);
    if (existsSync(source) && !existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
  const legacyIcons = join(legacyDir, "icons");
  const currentIcons = join(currentDir, "icons");
  if (existsSync(legacyIcons) && !existsSync(currentIcons)) {
    copyDirectory(legacyIcons, currentIcons);
  }
}
