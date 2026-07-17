import { describe, expect, it } from "vitest";
import { fallbackIconDataUrl } from "./icon-service.js";

describe("icon-service", () => {
  it("creates an encoded fallback icon without leaking markup", () => {
    const value = fallbackIconDataUrl("<&");
    expect(value).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(value)).toContain("&lt;&amp;");
    expect(value).not.toContain("<svg");
  });

  it("uses APP when the label is empty", () => {
    expect(decodeURIComponent(fallbackIconDataUrl(""))).toContain(">APP</text>");
  });
});
