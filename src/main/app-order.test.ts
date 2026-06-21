import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types";
import { mergeVisibleAppOrder, validateGroupAppOrder } from "./app-order";

const app = (id: string, groupId = "games"): AppEntry => ({
  id,
  name: id,
  category: groupId,
  groupId,
  executablePath: `C:\\Apps\\${id}.exe`,
  processName: `${id}.exe`,
  accent: "#2563eb",
});

describe("app ordering", () => {
  it("reorders visible apps while preserving hidden apps in their original slots", () => {
    const current = [app("a"), app("hidden-1"), app("b"), app("hidden-2"), app("c"), app("other", "tools")];

    const next = mergeVisibleAppOrder(current, "games", ["c", "a", "b"]);

    expect(next.map((item) => item.id)).toEqual(["c", "hidden-1", "a", "hidden-2", "b", "other"]);
  });

  it("rejects duplicate, unknown, and cross-group app ids", () => {
    const current = [app("a"), app("b"), app("tool", "tools")];

    expect(() => validateGroupAppOrder(current, "games", ["a", "a"])).toThrow("排序数据包含重复应用");
    expect(() => validateGroupAppOrder(current, "games", ["missing"])).toThrow("排序数据包含未知应用");
    expect(() => validateGroupAppOrder(current, "games", ["tool"])).toThrow("排序数据包含其他分组的应用");
  });
});
