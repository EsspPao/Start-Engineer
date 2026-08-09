import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hardenWebContents } from "./web-contents-security.js";

describe("renderer web contents security", () => {
  it("blocks renderer navigation, new windows and permission requests", () => {
    let navigationHandler: ((event: { preventDefault: () => void }) => void) | undefined;
    let windowHandler: (() => { action: "deny" }) | undefined;
    let permissionHandler: ((webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) | undefined;
    const webContents = {
      on: vi.fn((_event: "will-navigate", handler: typeof navigationHandler) => { navigationHandler = handler; }),
      setWindowOpenHandler: vi.fn((handler: typeof windowHandler) => { windowHandler = handler; }),
      session: {
        setPermissionRequestHandler: vi.fn((handler: typeof permissionHandler) => { permissionHandler = handler; })
      }
    };

    hardenWebContents(webContents);

    const preventDefault = vi.fn();
    navigationHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(windowHandler?.()).toEqual({ action: "deny" });
    const callback = vi.fn();
    permissionHandler?.({}, "notifications", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("applies the hardening helper, sandbox and CSP to the main renderer", () => {
    const windowSource = readFileSync(join(process.cwd(), "src/main/app-window-service.ts"), "utf8");
    const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(windowSource).toContain("sandbox: true");
    expect(windowSource).toContain("hardenWebContents(this.mainWindow.webContents)");
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(indexHtml).toContain("script-src 'self'");
    expect(indexHtml).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(indexHtml).toContain("object-src 'none'");
    expect(indexHtml).toContain("frame-src 'none'");
  });
});
