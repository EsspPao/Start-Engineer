import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("./settings-page.tsx", import.meta.url), "utf8");
const searchHook = readFileSync(new URL("./use-search-results.ts", import.meta.url), "utf8");
const executableDropHook = readFileSync(new URL("./use-executable-drop.ts", import.meta.url), "utf8");
const unifiedDragHook = readFileSync(new URL("./use-unified-grid-drag.ts", import.meta.url), "utf8");

describe("renderer responsibility boundaries", () => {
  it("keeps SettingsPage outside the renderer composition root", () => {
    expect(entry).toContain('import { SettingsPage } from "./settings-page"');
    expect(entry).not.toContain("function SettingsPage");
    expect(settingsPage).toContain("useSettingsPreferences(");
    expect(settingsPage).toContain("useSettingsGroupDrag(");
  });

  it("keeps asynchronous search orchestration in its controller", () => {
    expect(entry).toContain("useSearchResults(");
    expect(entry).not.toContain("const searchRequest = useRef");
    expect(searchHook).toContain("const requestId = ++searchRequest.current");
    expect(searchHook).toContain("runtimeAppsRef.current");
  });

  it("keeps executable and unified-grid drag listeners outside the entry", () => {
    expect(entry).toContain("useExecutableDrop(");
    expect(entry).toContain("useUnifiedGridDrag(");
    expect(executableDropHook).toContain("fileDropDepth.current");
    expect(unifiedDragHook).toContain('window.addEventListener("pointermove", move)');
    expect(unifiedDragHook).toContain("APP_MERGE_HOVER_MS");
    expect(entry).not.toContain("const updateMergeFeedback");
  });
});
