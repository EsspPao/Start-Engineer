import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./settings-page.tsx", import.meta.url), "utf8");
const entrySource = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const dragHookSource = readFileSync(new URL("./use-settings-group-drag.ts", import.meta.url), "utf8");

describe("settings group drag preview", () => {
  it("renders the sort preview through a body portal so fixed positioning stays viewport-based", () => {
    expect(source).toContain("createPortal(");
    expect(source).toMatch(/createPortal\(\s*<GroupSortPreview[\s\S]*document\.body\s*\)/);
  });

  it("keeps settings group drag orchestration outside the renderer entry", () => {
    expect(source).toContain("useSettingsGroupDrag({ groups, apps, onReorder, onMoveApp })");
    expect(entrySource).not.toContain("function SettingsPage");
    expect(source).not.toContain('window.addEventListener("pointermove", move)');
    expect(dragHookSource).toContain('window.addEventListener("pointermove", move)');
    expect(dragHookSource).toContain("Math.hypot(event.clientX - sort.startX");
  });
});
