import { describe, expect, it } from "vitest";
import { appSearchRank } from "./app-search.js";

describe("short app queries", () => {
  it.each(["hu", "ＨＵ", " ui ", "h"])("does not match hidden process names for %s", (query) => {
    for (const app of [
      { name: "反馈中心", processName: "FeedbackHub" },
      { name: "Windows 安全中心", processName: "SecHealthUI" }
    ]) expect(appSearchRank(app, query)).toBe(Infinity);
  });
  it("keeps visible Chinese, English and numeric name matches", () => {
    for (const [name, query] of [["反馈中心", "反馈"], ["Hugo", "hu"], ["UU远程", "u"], ["7-Zip", "7"]]) {
      expect(Number.isFinite(appSearchRank({ name, processName: "Other" }, query))).toBe(true);
    }
  });
  it("keeps longer process searches", () => {
    expect(appSearchRank({ name: "反馈中心", processName: "FeedbackHub" }, "hub")).toBe(5);
  });
});
