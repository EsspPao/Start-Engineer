import { describe, expect, it, vi } from "vitest";
import { buildSplashHtml, splashWindowOptions, wireSplashToMainWindow } from "./splash-window.js";

describe("splash window", () => {
  it("uses a tiny frameless isolated window that stays out of the taskbar", () => {
    expect(splashWindowOptions("C:\\Apps\\Start Engineer\\build\\icon.ico")).toMatchObject({
      width: 420,
      height: 260,
      resizable: false,
      frame: false,
      transparent: true,
      show: true,
      skipTaskbar: true,
      title: "Start Engineer",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });
  });

  it("renders static low-text HTML with the Start Engineer brand and loading motion", () => {
    const html = buildSplashHtml("file:///C:/Apps/Start%20Engineer/icon.ico");

    expect(html).toContain("Start Engineer");
    expect(html).toContain("file:///C:/Apps/Start%20Engineer/icon.ico");
    expect(html).toContain("class=\"loader\"");
    expect(html).not.toContain("资源监控");
    expect(html).not.toContain("Everything");
    expect(html).not.toContain("加载配置");
  });

  it("destroys splash after the main window is ready", () => {
    const handlers = new Map<string, () => void>();
    const mainWindow = { once: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)) };
    const splashWindow = { isDestroyed: vi.fn(() => false), destroy: vi.fn() };
    const showMainWindow = vi.fn();

    wireSplashToMainWindow(mainWindow, splashWindow, showMainWindow);
    handlers.get("ready-to-show")?.();

    expect(showMainWindow).toHaveBeenCalledOnce();
    expect(splashWindow.destroy).toHaveBeenCalledOnce();
  });

  it("does not leave splash hanging when main window load fails", () => {
    const windowHandlers = new Map<string, () => void>();
    const webContentsHandlers = new Map<string, () => void>();
    const mainWindow = {
      once: vi.fn((event: string, handler: () => void) => windowHandlers.set(event, handler)),
      webContents: {
        once: vi.fn((event: string, handler: () => void) => webContentsHandlers.set(event, handler))
      }
    };
    const splashWindow = { isDestroyed: vi.fn(() => false), destroy: vi.fn() };
    const showMainWindow = vi.fn();
    const showLoadFailure = vi.fn();

    wireSplashToMainWindow(mainWindow, splashWindow, showMainWindow, showLoadFailure);
    webContentsHandlers.get("did-fail-load")?.();

    expect(showMainWindow).not.toHaveBeenCalled();
    expect(splashWindow.destroy).toHaveBeenCalledOnce();
    expect(showLoadFailure).toHaveBeenCalledOnce();
  });
});
