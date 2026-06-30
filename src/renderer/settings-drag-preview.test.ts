import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

describe("settings group drag preview", () => {
  it("renders the sort preview through a body portal so fixed positioning stays viewport-based", () => {
    expect(source).toContain("createPortal(");
    expect(source).toMatch(/createPortal\(\s*<GroupSortPreview[\s\S]*document\.body\s*\)/);
  });
});
