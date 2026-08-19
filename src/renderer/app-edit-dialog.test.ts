import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup, AppMetrics } from "../shared/types";
import { AppContextMenu } from "./context-menus";
import { AppEditDialog } from "./app-edit-dialog";

const metrics: AppMetrics = {
  appId: "steam",
  isRunning: false,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: [],
  matchedPids: [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
};

const app: AppEntry & { metrics: AppMetrics } = {
  id: "steam",
  name: "Steam",
  category: "游戏",
  groupId: "games",
  executablePath: "D:\\Apps\\Steam\\steam.exe",
  processName: "steam",
  accent: "#2563eb",
  metrics
};

const groups: AppGroup[] = [{ id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }];

describe("app edit dialog", () => {
  it("显示只读启动程序路径和选择操作", () => {
    const html = renderToStaticMarkup(createElement(AppEditDialog, {
      state: { id: app.id, name: app.name, executablePath: app.executablePath, launchArgs: "", wakeStrategy: "auto" },
      onClose: vi.fn(),
      onPickExecutable: vi.fn(async () => null),
      onSave: vi.fn(async () => undefined)
    }));

    expect(html).toContain("启动程序");
    expect(html).toContain(app.executablePath);
    expect(html).toContain("readonly");
    expect(html).toContain("选择程序");
    expect(html).toContain("高级设置");
    expect(html).toContain("自动推荐");
    expect(html).toContain("使用 Windows 应用身份唤醒");
    expect(html).toContain("disabled");
    expect(html).not.toContain("工作目录");
  });

  it("右键菜单仅保留编辑应用信息入口", () => {
    const html = renderToStaticMarkup(createElement(AppContextMenu, {
      state: { kind: "app", x: 24, y: 24, appId: app.id },
      app,
      groups,
      onClose: vi.fn(),
      onLaunch: vi.fn(),
      onKill: vi.fn(),
      onEdit: vi.fn(),
      onMove: vi.fn(async () => undefined),
      onRemove: vi.fn(),
      onNotice: vi.fn(),
      onError: vi.fn()
    }));

    expect(html).toContain("编辑应用信息");
    expect(html).not.toContain("修改启动程序");
  });

  it("Windows Store 应用显示稳定标识而不是版本化安装路径", () => {
    const storeApp = {
      ...app,
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"
    };
    const dialogHtml = renderToStaticMarkup(createElement(AppEditDialog, {
      state: {
        id: storeApp.id,
        name: "ChatGPT",
        executablePath: storeApp.executablePath,
        launchArgs: "",
        appUserModelId: storeApp.appUserModelId,
        wakeStrategy: "aumid"
      },
      onClose: vi.fn(),
      onPickExecutable: vi.fn(async () => null),
      onSave: vi.fn(async () => undefined)
    }));
    const menuHtml = renderToStaticMarkup(createElement(AppContextMenu, {
      state: { kind: "app", x: 24, y: 24, appId: storeApp.id },
      app: storeApp,
      groups,
      onClose: vi.fn(),
      onLaunch: vi.fn(),
      onKill: vi.fn(),
      onEdit: vi.fn(),
      onMove: vi.fn(async () => undefined),
      onRemove: vi.fn(),
      onNotice: vi.fn(),
      onError: vi.fn()
    }));

    expect(dialogHtml).toContain("Windows 应用标识");
    expect(dialogHtml).toContain("OpenAI.Codex_2p2nqsd0c76g0!App");
    expect(dialogHtml).not.toContain("OpenAI.Codex_26.721.4979.0");
    expect(dialogHtml).toContain("改用本地程序");
    expect(dialogHtml).toContain("使用 Windows 应用身份唤醒");
    expect(dialogHtml).toContain("稳定的 Windows 应用身份");
    expect(menuHtml).toContain("复制 Windows 应用标识");
  });
});
