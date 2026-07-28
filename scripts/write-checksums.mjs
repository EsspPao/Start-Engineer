import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const releaseDir = join(process.cwd(), "release");
const files = [
  `Start-Engineer-Setup-${packageJson.version}.exe`,
  `Start-Engineer-Portable-${packageJson.version}.exe`
];

const lines = [];
for (const file of files) {
  const contents = await readFile(join(releaseDir, file));
  lines.push(`${createHash("sha256").update(contents).digest("hex")} *${file}`);
}

await writeFile(join(releaseDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
