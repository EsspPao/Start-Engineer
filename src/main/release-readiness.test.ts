import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("public release readiness", () => {
  it("declares public repository metadata and deterministic release commands", () => {
    const packageJson = JSON.parse(read("package.json"));
    expect(packageJson.private).toBe(true);
    expect(packageJson.engines.node).toBe(">=22.12.0");
    expect(packageJson.devDependencies.electron).toMatch(/^43\./);
    expect(packageJson.scripts.postinstall).toContain("electron:install");
    expect(packageJson.repository.url).toContain("EsspPao/Start-Engineer");
    expect(packageJson.homepage).toContain("github.com/EsspPao/Start-Engineer");
    expect(packageJson.scripts["release:prepare"]).toContain("release:checksums");
    expect(packageJson.scripts["release:prepare"]).toContain("package:win:artifacts");
    expect(packageJson.build.win.signAndEditExecutable).toBe(true);
    expect(packageJson.build.win.requestedExecutionLevel).toBe("asInvoker");
    expect(packageJson.build.electronDist).toBe("node_modules/electron/dist");
    expect(packageJson.scripts["package:win:artifacts"]).toContain("--x64");
    expect(packageJson.scripts["package:win:artifacts:signed"]).toContain("signAndEditExecutable=true");
  });

  it("keeps public support, privacy, security and release documents", () => {
    for (const path of ["README.md", "PRIVACY.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "docs/TROUBLESHOOTING.md", "docs/RELEASE_CHECKLIST.md", ".github/dependabot.yml"]) {
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
    expect(workflow).toContain("ConvertFrom-Json");
    expect(workflow).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(workflow).toContain("package:win:artifacts");
    expect(workflow).toContain("github.run_id");
    expect(workflow).toContain("$releaseArgs");
    expect(workflow).toContain("github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).not.toContain('node -p \\\"');
    expect(workflow).not.toContain("release/Start-Engineer-Setup-*.exe.blockmap");
    expect(workflow).not.toMatch(/actions\/(?:checkout|setup-node|setup-dotnet|upload-artifact|download-artifact)@v\d/);
  });
});
