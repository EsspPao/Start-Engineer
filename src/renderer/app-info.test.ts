import { describe, expect, it } from "vitest";
import { formatAppDiagnostics } from "./app-info";

describe("app diagnostics", () => {
  it("formats version and environment details without application data", () => {
    const diagnostics = formatAppDiagnostics({
      version: "0.1.0",
      electronVersion: "33.2.1",
      chromeVersion: "130.0.0.0",
      nodeVersion: "20.18.1",
      platform: "win32",
      arch: "x64",
      systemVersion: "10.0.26100",
      userDataPath: "C:\\Users\\Demo\\AppData\\Roaming\\start-engineer",
      isPackaged: true,
      repositoryUrl: "https://github.com/EsspPao/Start-Engineer"
    });

    expect(diagnostics).toContain("Start Engineer 0.1.0");
    expect(diagnostics).toContain("Windows: 10.0.26100 (x64)");
    expect(diagnostics).toContain("Packaged: yes");
    expect(diagnostics).not.toContain("apps.json");
  });
});
