import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Start Engineer branding", () => {
  it("uses Start Engineer for package metadata and html title", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const html = readFileSync("index.html", "utf8");

    expect(pkg.name).toBe("start-engineer");
    expect(pkg.build.productName).toBe("Start Engineer");
    expect(pkg.build.appId).toBe("com.essppao.startengineer");
    expect(pkg.build.nsis.artifactName).toContain("Start-Engineer");
    expect(pkg.build.portable.artifactName).toContain("Start-Engineer");
    expect(html).toContain("<title>Start Engineer</title>");
    expect(html).not.toContain("Star Engineer");
  });
});
