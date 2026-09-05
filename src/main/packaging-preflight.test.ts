import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows packaging preflight", () => {
  it("checks and closes Start Engineer before packaging", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const script = readFileSync(join(process.cwd(), "scripts/close-running-app.mjs"), "utf8");
    expect(packageJson.scripts["prepackage:win"]).toBe("node scripts/close-running-app.mjs");
    expect(packageJson.scripts["prepackage:win:signed"]).toBe("node scripts/close-running-app.mjs");
    expect(packageJson.scripts["prerelease:prepare"]).toBe("node scripts/close-running-app.mjs");
    expect(script).toContain("tasklist.exe");
    expect(script).toContain("Get-Process -Name 'Start Engineer'");
    expect(script).toContain("taskkill.exe");
    expect(script).toContain('"/PID"');
    expect(script).toContain("Start Engineer.exe");
    expect(script).toContain("-Verb RunAs");
    expect(script).not.toMatch(/["'`]\/T["'`]/);
    expect(script).toContain("must survive packaging cleanup");
  });

  it("cleans stale compiler output and excludes tests from packaged files", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const cleanScript = readFileSync(join(process.cwd(), "scripts/clean-build-output.mjs"), "utf8");
    const verifyScript = readFileSync(join(process.cwd(), "scripts/verify-build-artifacts.mjs"), "utf8");

    expect(packageJson.scripts["build"]).toContain("npm run clean:build");
    expect(packageJson.scripts["build"]).toContain("verify-build-artifacts.mjs");
    expect(packageJson.build.files).toContain("!dist-electron/**/*.test.*");
    expect(packageJson.build.files).toContain("!dist-electron/**/*.spec.*");
    expect(cleanScript).toContain('["dist", "dist-electron", "dist-native"]');
    expect(cleanScript).toContain("relativeTarget.startsWith");
    expect(verifyScript).toContain("Test artifacts must not be packaged");
  });

  it("cleans only known stale release outputs before packaging artifacts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const cleanReleaseScript = readFileSync(join(process.cwd(), "scripts/clean-release-output.mjs"), "utf8");

    expect(packageJson.scripts["package:win:artifacts"]).toContain("npm run clean:release");
    expect(packageJson.scripts["package:win:artifacts:signed"]).toContain("npm run clean:release");
    expect(cleanReleaseScript).toContain("versionedArtifactPattern");
    expect(cleanReleaseScript).toContain('entry.name.startsWith("win-unpacked")');
    expect(cleanReleaseScript).toContain("relativeTarget.startsWith");
  });

  it("removes unused files copied from the installed Electron distribution", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const afterPackScript = readFileSync(join(process.cwd(), "scripts/after-pack.cjs"), "utf8");

    expect(packageJson.build.electronDist).toBe("node_modules/electron/dist");
    expect(packageJson.build.afterPack).toBe("scripts/after-pack.cjs");
    expect(afterPackScript).toContain('"default_app.asar"');
    expect(afterPackScript).toContain('"app-update.yml"');
    expect(afterPackScript).toContain('resolve(appOutDir, "version")');
    expect(afterPackScript).toContain("relativeTarget.startsWith");
  });

  it("publishes a trimmed self-contained helper and exercises its native protocol", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const helperBuild = readFileSync(join(process.cwd(), "scripts/build-window-helper.mjs"), "utf8");
    const helperSmoke = readFileSync(join(process.cwd(), "scripts/smoke-window-helper.mjs"), "utf8");
    const helperProject = readFileSync(join(process.cwd(), "native/window-focus-helper/window-focus-helper.csproj"), "utf8");

    expect(helperProject).toContain("<SelfContained>true</SelfContained>");
    expect(helperProject).toContain("<PublishSingleFile>true</PublishSingleFile>");
    expect(helperProject).toContain("<PublishTrimmed>true</PublishTrimmed>");
    expect(helperProject).toContain("<BuiltInComInteropSupport>true</BuiltInComInteropSupport>");
    expect(helperProject).not.toContain("<UseWindowsForms>true</UseWindowsForms>");
    expect(helperProject).toContain('PackageReference Include="System.Drawing.Common" Version="8.0.29"');
    expect(helperBuild).toContain("DebugSymbols=false");
    expect(helperBuild).toContain("debugSymbols.length > 0");
    expect(helperBuild).toContain("smoke-window-helper.mjs");
    for (const command of ["is-elevated", "scan", "focus", "snapshot", "shortcuts", "icon", "launch", "runtime"]) {
      expect(helperSmoke).toContain(`\"${command}\"`);
    }
    expect(helperSmoke).toContain('process.env.CI !== "true"');
    expect(helperBuild).toContain("-p:FileVersion=${fileVersion}");
    expect(helperBuild).toContain("-p:InformationalVersion=${appVersion}");
    expect(helperProject).toContain("<IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>");
    expect(packageJson.build.extraResources[2].filter).toContain("!**/*.pdb");
    expect(packageJson.build.files).toContain("THIRD_PARTY_NOTICES.md");
    expect(packageJson.build.files).toContain("licenses/**/*");
    expect(packageJson.build.win.requestedExecutionLevel).toBe("asInvoker");
  });

  it("enforces the lightweight package boundary", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const footprint = readFileSync(join(process.cwd(), "scripts/verify-package-footprint.mjs"), "utf8");

    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies.react).toBeTruthy();
    expect(packageJson.devDependencies["react-dom"]).toBeTruthy();
    expect(packageJson.build.electronLanguages).toEqual(["zh-CN", "en-US"]);
    expect(packageJson.build.nsis.differentialPackage).toBe(false);
    expect(packageJson.scripts["package:win:artifacts"]).toContain("npm run verify:footprint");
    expect(packageJson.scripts["package:win:artifacts:signed"]).toContain("npm run verify:footprint");
    expect(footprint).toContain("const artifactBudget = 110 * mebibyte");
    expect(footprint).toContain("Unexpected Electron locales");
    expect(footprint).toContain("duplicate development dependencies");
  });
});
