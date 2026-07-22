import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { droppedAppPaths, dropNoticeForResult, targetDropGroupId } from "./dropped-files";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
const main = readFileSync(join(process.cwd(), "src/renderer/main.tsx"), "utf8");

describe("dropped files", () => {
  it("keeps executable files and Windows application shortcuts", () => {
    const files = [
      { name: "Codex.exe", path: "C:\\Tools\\Codex.exe" },
      { name: "Typora.lnk", path: "C:\\Desktop\\Typora.lnk" },
      { name: "readme.txt", path: "C:\\Docs\\readme.txt" },
      { name: "Steam.EXE", path: "C:\\Steam\\Steam.EXE" },
      { name: "missing.exe", path: "" }
    ];

    expect(droppedAppPaths(files, (file) => file.path)).toEqual([
      "C:\\Tools\\Codex.exe",
      "C:\\Desktop\\Typora.lnk",
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

  it("does not reserve a permanent permission warning over the application grid", () => {
    expect(styles).not.toContain("administrator-drop-warning");
    expect(main).not.toContain("管理员模式阻止资源管理器拖放");
  });
});
