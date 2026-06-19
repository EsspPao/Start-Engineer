import { describe, expect, it } from "vitest";
import { buildLaunchFeedbackMessage } from "./launch-feedback";

describe("launch feedback messages", () => {
  it("describes launch lifecycle states", () => {
    expect(buildLaunchFeedbackMessage("starting", "Weixin")).toBe("正在启动「Weixin」...");
    expect(buildLaunchFeedbackMessage("launched", "Weixin")).toBe("已启动「Weixin」");
    expect(buildLaunchFeedbackMessage("alreadyRunning", "Weixin")).toBe("「Weixin」已在运行");
  });
});
