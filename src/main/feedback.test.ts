import { describe, expect, it } from "vitest";
import { feedbackUrl } from "./feedback";
import type { AppInfo } from "../shared/types";
it("builds an editable feedback template without private paths", () => {
  const url = new URL(feedbackUrl({ version: "0.1.4", buildId: "abc123", systemVersion: "10", arch: "x64", isPackaged: true, userDataPath: "C:\\Users\\Secret\\data" } as AppInfo));
  expect(url.origin).toBe("https://github.com");
  expect(url.searchParams.get("body")).toContain("abc123");
  expect(url.searchParams.get("body")).not.toContain("Secret");
  expect(url.searchParams.get("body")).toContain("复现步骤");
});
