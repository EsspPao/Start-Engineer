import { describe, expect, it } from "vitest";
import { droppedExePaths, dropNoticeForResult, targetDropGroupId } from "./dropped-files";

describe("dropped files", () => {
  it("keeps only exe file paths", () => {
    const files = [
      { name: "Codex.exe", path: "C:\\Tools\\Codex.exe" },
      { name: "readme.txt", path: "C:\\Docs\\readme.txt" },
      { name: "Steam.EXE", path: "C:\\Steam\\Steam.EXE" },
      { name: "missing.exe", path: "" }
    ];

    expect(droppedExePaths(files, (file) => file.path)).toEqual([
      "C:\\Tools\\Codex.exe",
      "C:\\Steam\\Steam.EXE"
    ]);
  });

  it("uses the current app group or falls back to the first group", () => {
    expect(targetDropGroupId("office", ["games", "office"])).toBe("office");
    expect(targetDropGroupId("processes", ["games", "office"])).toBe("games");
    expect(targetDropGroupId("settings", [])).toBe("");
  });

  it("summarizes drag add results with short notices", () => {
    expect(dropNoticeForResult({ addedAppIds: ["a"], skippedPaths: [] })).toBe("已添加 1 个应用");
    expect(dropNoticeForResult({ addedAppIds: ["a", "b"], skippedPaths: ["x"] })).toBe("已添加 2 个应用，已跳过 1 个");
    expect(dropNoticeForResult({ addedAppIds: [], skippedPaths: ["x"] })).toBe("应用已存在或文件无效");
  });
});
