import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StartupExecutableResolver } from "./startup-executable.js";

describe("startup executable resolver", () => {
  it("uses the installed executable without creating a runtime cache", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-installed-startup-"));
    const executable = join(root, "installed", "Start Engineer.exe");
    const resolver = new StartupExecutableResolver({ execPath: executable, localAppDataPath: join(root, "local"), version: "0.1.0" });

    expect(resolver.path()).toBe(executable);
    expect(resolver.prepare()).toBe(executable);
  });

  it("copies a portable runtime and refreshes it when the portable build changes", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-portable-startup-"));
    const source = join(root, "temp-runtime");
    const executable = join(source, "Start Engineer.exe");
    const portable = join(root, "Start-Engineer-Portable.exe");
    mkdirSync(join(source, "resources"), { recursive: true });
    writeFileSync(executable, "runtime-v1");
    writeFileSync(join(source, "resources", "app.asar"), "asar-v1");
    writeFileSync(portable, "portable-v1");
    const resolver = new StartupExecutableResolver({ execPath: executable, portableExecutable: portable, localAppDataPath: join(root, "local"), version: "0.1.0" });

    const cachedExecutable = resolver.prepare();
    expect(cachedExecutable).toBe(join(root, "local", "Start Engineer", "startup-runtime", "Start Engineer.exe"));
    expect(readFileSync(cachedExecutable, "utf8")).toBe("runtime-v1");
    expect(readFileSync(join(root, "local", "Start Engineer", "startup-runtime", "resources", "app.asar"), "utf8")).toBe("asar-v1");

    writeFileSync(executable, "runtime-v2");
    writeFileSync(portable, "portable-build-v2");
    expect(readFileSync(resolver.prepare(), "utf8")).toBe("runtime-v2");
  });
});
