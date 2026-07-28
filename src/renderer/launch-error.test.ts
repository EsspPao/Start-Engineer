import { describe, expect, it } from "vitest";
import { shouldOfferExecutableReplacement } from "./launch-error";

describe("launch error recovery", () => {
  it("offers a replacement executable for an ordinary missing-path app", () => {
    expect(shouldOfferExecutableReplacement(undefined, {
      errorCode: 2,
      message: "程序路径不存在，请重新选择启动程序。"
    })).toBe(true);
  });

  it("never asks a Store app to replace its stable identity with an EXE", () => {
    expect(shouldOfferExecutableReplacement({
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App"
    }, {
      errorCode: 2,
      message: "程序路径不存在"
    })).toBe(false);
  });
});
