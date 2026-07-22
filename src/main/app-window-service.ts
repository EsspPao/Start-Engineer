import { BrowserWindow, dialog, Menu, nativeImage, nativeTheme, Tray } from "electron";
import type { AppPreferences } from "../shared/types.js";
import { resolveUiTheme, themeUsesMica } from "../shared/theme.js";
import { splashHtmlDataUrl, splashWindowOptions, wireSplashToMainWindow } from "./splash-window.js";
import { startEngineerGroupShortcutDirection } from "./window-shortcuts.js";
import { pathToFileURL } from "node:url";

type AppWindowServiceOptions = {
  isDev: boolean;
  rendererUrl?: string;
  rendererIndex: string;
  preloadPath: string;
  appIconPath: () => string;
  trayIconPath: () => string;
  smokeMode: boolean;
  loadPreferences: () => AppPreferences;
  savePreferences: (preferences: AppPreferences) => AppPreferences | void;
  quit: () => void;
};

export function windowBackgroundColor(_theme: ReturnType<typeof resolveUiTheme>) {
  return "#00000000";
}

export class AppWindowService {
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private quitting = false;
  private boundsSaveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: AppWindowServiceOptions) {}

  getMainWindow() { return this.mainWindow; }
  isQuitting() { return this.quitting; }

  ownProcessIds() {
    const ids = new Set([process.pid]);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) ids.add(this.mainWindow.webContents.getOSProcessId());
    return ids;
  }

  prepareToQuit() {
    this.quitting = true;
    if (this.boundsSaveTimer) clearTimeout(this.boundsSaveTimer);
    this.boundsSaveTimer = null;
    this.tray?.destroy();
    this.tray = null;
  }

  toggleMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible() && !this.mainWindow.isMinimized() && this.mainWindow.isFocused()) {
      this.mainWindow.hide();
      return;
    }
    this.showMainWindow();
  }

  showMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.createWindow();
      return;
    }
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  applyTheme(preferences = this.options.loadPreferences()) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const theme = resolveUiTheme(preferences.uiTheme, nativeTheme.shouldUseDarkColors);
    if (process.platform === "win32") {
      try {
        this.mainWindow.setBackgroundMaterial(themeUsesMica(theme) ? "mica" : "none");
      } catch {
        // CSS backgrounds remain the visual fallback on unsupported Windows versions.
      }
    }
    this.mainWindow.setBackgroundColor(windowBackgroundColor(theme));
  }

  watchSystemTheme() {
    nativeTheme.on("updated", () => {
      if (this.options.loadPreferences().uiTheme === "system") this.applyTheme();
    });
  }

  createSplashWindow() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) return this.splashWindow;
    this.splashWindow = new BrowserWindow(splashWindowOptions(this.options.appIconPath()));
    this.splashWindow.on("closed", () => { this.splashWindow = null; });
    void this.splashWindow.loadURL(splashHtmlDataUrl(pathToFileURL(this.options.appIconPath()).toString()));
    return this.splashWindow;
  }

  async createTray() {
    if (this.tray) return;
    let icon = nativeImage.createFromPath(this.options.trayIconPath());
    if (icon.isEmpty()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#52c8ed"/><stop offset=".55" stop-color="#6370f3"/><stop offset="1" stop-color="#9361eb"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="m16 7 2.1 5.2L23 14l-4.9 1.8L16 21l-2.1-5.2L9 14l4.9-1.8L16 7Z" fill="white"/></svg>`;
      icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip("Start Engineer");
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开 Start Engineer", click: () => this.showMainWindow() },
      { type: "separator" },
      { label: "退出", click: () => { this.prepareToQuit(); this.options.quit(); } }
    ]));
    this.tray.on("click", () => this.showMainWindow());
  }

  createWindow() {
    const preferences = this.options.loadPreferences();
    const savedBounds = preferences.windowBounds;
    this.mainWindow = new BrowserWindow({
      width: savedBounds?.width ?? 1280,
      height: savedBounds?.height ?? 760,
      ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
      minWidth: 1060,
      minHeight: 680,
      frame: false,
      thickFrame: false,
      hasShadow: true,
      transparent: true,
      show: false,
      backgroundColor: "#00000000",
      title: "Start Engineer",
      icon: this.options.appIconPath(),
      webPreferences: { preload: this.options.preloadPath, contextIsolation: true, nodeIntegration: false }
    });

    this.mainWindow.on("close", (event) => {
      if (!this.quitting && this.options.loadPreferences().closeBehavior === "tray") {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });
    this.mainWindow.on("move", () => this.scheduleSaveBounds());
    this.mainWindow.on("resize", () => this.scheduleSaveBounds());
    this.mainWindow.on("closed", () => { this.mainWindow = null; });
    this.mainWindow.webContents.on("before-input-event", (event, input) => {
      const direction = startEngineerGroupShortcutDirection(input);
      if (!direction) return;
      event.preventDefault();
      this.mainWindow?.webContents.send("keyboard:groupNavigation", direction);
    });
    wireSplashToMainWindow(this.mainWindow, this.splashWindow, () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      this.mainWindow.show();
      this.mainWindow.focus();
    }, () => dialog.showErrorBox("Start Engineer", "主窗口加载失败，请重新启动应用。"));

    this.applyTheme(preferences);
    if (this.options.isDev && this.options.rendererUrl) void this.mainWindow.loadURL(this.options.rendererUrl);
    else void this.mainWindow.loadFile(this.options.rendererIndex);

    if (this.options.smokeMode) {
      this.mainWindow.webContents.once("did-finish-load", () => {
        console.log("STAR_ENGINEER_SMOKE_READY");
        setTimeout(() => this.options.quit(), 100);
      });
    }
  }

  private scheduleSaveBounds() {
    if (!this.canSaveBounds()) return;
    if (this.boundsSaveTimer) clearTimeout(this.boundsSaveTimer);
    this.boundsSaveTimer = setTimeout(() => {
      this.boundsSaveTimer = null;
      if (!this.canSaveBounds() || !this.mainWindow) return;
      this.options.savePreferences({ ...this.options.loadPreferences(), windowBounds: this.mainWindow.getBounds() });
    }, 500);
  }

  private canSaveBounds() {
    return Boolean(this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isMinimized() && !this.mainWindow.isFullScreen());
  }
}
