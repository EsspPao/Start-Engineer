import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("public release readiness", () => {
  it("declares public repository metadata and deterministic release commands", () => {
    const packageJson = JSON.parse(read("package.json"));
    expect(packageJson.private).toBe(true);
    expect(packageJson.repository.url).toContain("EsspPao/Start-Engineer");
    expect(packageJson.homepage).toContain("github.com/EsspPao/Start-Engineer");
    expect(packageJson.scripts["release:prepare"]).toContain("release:checksums");
    expect(packageJson.build.win.signAndEditExecutable).toBe(false);
    expect(packageJson.scripts["package:win:signed"]).toContain("signAndEditExecutable=true");
  });

  it("keeps public support, privacy, security and release documents", () => {
    for (const path of ["README.md", "PRIVACY.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "docs/TROUBLESHOOTING.md", "docs/RELEASE_CHECKLIST.md"]) {
      expect(existsSync(join(root, path)), `${path} should exist`).toBe(true);
    }
    expect(read("README.md")).toContain("SHA256SUMS.txt");
    expect(read("PRIVACY.md")).toContain("不包含遥测");
  });

  it("builds draft releases and never publishes a tag without review", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("--draft");
    expect(workflow).toContain("--verify-tag");
    expect(workflow).toContain("WIN_CSC_LINK");
    expect(workflow).toContain("SHA256SUMS.txt");
  });
});
