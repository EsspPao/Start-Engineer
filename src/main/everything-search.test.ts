import { describe, expect, it } from "vitest";
import { buildEverythingArgs, decodeEverythingOutput, parseEverythingCsv } from "./everything-search.js";

describe("Everything search adapter", () => {
  it("builds bounded CSV search arguments", () => {
    expect(buildEverythingArgs("  demo app  ", 80)).toEqual(["-n", "80", "-csv", "-name", "-path-column", "-size", "-date-modified", "demo app"]);
  });

  it("does not use the directory-filtering -path flag for result columns", () => {
    expect(buildEverythingArgs("微信", 80)).not.toContain("-path");
  });

  it("decodes Chinese results emitted with the Windows ANSI code page", () => {
    const output = Buffer.concat([
      Buffer.from('"Name","Path","Size","Date Modified"\r\n', "ascii"),
      Buffer.from([
        0x22, 0xce, 0xa2, 0xd0, 0xc5, 0x2e, 0x6c, 0x6e, 0x6b, 0x22,
        0x2c, 0x22, 0x43, 0x3a, 0x5c, 0xce, 0xa2, 0xd0, 0xc5, 0x22,
        0x2c, 0x22, 0x35, 0x36, 0x39, 0x22,
        0x2c, 0x22, 0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x36, 0x2d, 0x31, 0x36, 0x22
      ])
    ]);

    const decoded = decodeEverythingOutput(output);

    expect(decoded).toContain("微信.lnk");
    expect(parseEverythingCsv(decoded)[0]).toMatchObject({
      name: "微信.lnk",
      path: "C:\\微信\\微信.lnk"
    });
  });

  it("parses CSV rows into file and folder results", () => {
    const csv = [
      '"Name","Path","Size","Date Modified"',
      '"demo.txt","C:\\Users\\Xbfe\\Desktop","12","2026-06-16 00:00:00"',
      '"Projects","D:\\Code","","2026-06-15 23:00:00"'
    ].join("\r\n");

    expect(parseEverythingCsv(csv)).toEqual([
      { name: "demo.txt", path: "C:\\Users\\Xbfe\\Desktop\\demo.txt", kind: "file", sizeBytes: 12, modifiedAt: "2026-06-16 00:00:00" },
      { name: "Projects", path: "D:\\Code\\Projects", kind: "folder", modifiedAt: "2026-06-15 23:00:00" }
    ]);
  });
});
