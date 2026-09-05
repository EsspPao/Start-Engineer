import type { AppPreferences, AppPreferencesState, UpdatePreferencesInput } from "../shared/types.js";
import { validateShortcut } from "../shared/global-shortcut.js";
import { decodeUiLayoutShareCode, encodeUiLayoutShareCode } from "../shared/ui-layout-share.js";
import { JsonConfigStore } from "./config-store.js";
import { defaultPreferences, normalizePreferences } from "./preferences.js";

type ShortcutStatus = Pick<AppPreferencesState, "globalShortcutStatus" | "globalShortcutMessage">;

type PreferencesServiceOptions = {
  path: () => string;
  loginExecutable: () => string;
  prepareLoginExecutable: () => string;
  loginArgs: string[];
  getLoginItemEnabled: (path: string, args: string[]) => boolean;
  setLoginItemEnabled: (enabled: boolean, path: string, args: string[]) => void;
  registerShortcut: (accelerator: string, callback: () => void) => boolean;
  unregisterShortcut: (accelerator: string) => void;
  isShortcutRegistered: (accelerator: string) => boolean;
  toggleMainWindow: () => void;
  getAdministratorState: () => { isRunningAsAdministrator: boolean; administratorStatusLoading: boolean; elevatedTerminationStatus: AppPreferencesState["elevatedTerminationStatus"]; administratorMessage?: string };
  clearAdministratorMessage: () => void;
  applyTheme: (preferences: AppPreferences) => void;
};

export class PreferencesService {
  private readonly store: JsonConfigStore<AppPreferences>;
  private registeredShortcut = "";
  private shortcutState: ShortcutStatus = { globalShortcutStatus: "disabled" };

  constructor(private readonly options: PreferencesServiceOptions) {
    this.store = new JsonConfigStore<AppPreferences>({
      path: options.path,
      normalize: (raw) => normalizePreferences(raw as Partial<AppPreferences>),
      fallback: () => ({ ...defaultPreferences })
    });
  }

  load() {
    return this.store.load();
  }

  save(preferences: AppPreferences) {
    return this.store.save(preferences);
  }

  snapshot(): AppPreferencesState {
    const preferences = this.load();
    const administrator = this.options.getAdministratorState();
    return {
      ...preferences,
      launchAtStartup: this.loginItemEnabled(),
      ...this.shortcutState,
      isRunningAsAdministrator: administrator.isRunningAsAdministrator,
      administratorStatusLoading: administrator.administratorStatusLoading,
      administratorRestartRequired: preferences.runAsAdministrator
        && !administrator.isRunningAsAdministrator
        && ["disabled", "cancelled", "failed"].includes(administrator.elevatedTerminationStatus),
      elevatedTerminationStatus: administrator.elevatedTerminationStatus,
      ...(administrator.administratorMessage ? { administratorMessage: administrator.administratorMessage } : {})
    };
  }

  update(input: UpdatePreferencesInput) {
    const next = normalizePreferences({ ...this.snapshot(), ...input });
    if (input.runAsAdministrator !== undefined) this.options.clearAdministratorMessage();
    if (input.launchAtStartup !== undefined) {
      const path = next.launchAtStartup ? this.options.prepareLoginExecutable() : this.options.loginExecutable();
      this.options.setLoginItemEnabled(next.launchAtStartup, path, this.options.loginArgs);
      if (this.loginItemEnabled() !== next.launchAtStartup) throw new Error("Windows 开机启动设置未能生效");
    }
    if (input.globalShortcut !== undefined || input.globalShortcutEnabled !== undefined) return this.applyGlobalShortcut(next, true);
    this.save(next);
    if (input.uiTheme !== undefined) this.options.applyTheme(next);
    return this.snapshot();
  }

  reconcileLoginItem() {
    if (!this.load().launchAtStartup) return false;
    const path = this.options.prepareLoginExecutable();
    this.options.setLoginItemEnabled(true, path, this.options.loginArgs);
    if (!this.loginItemEnabled()) throw new Error("Windows 开机启动设置未能更新到快速启动路径");
    return true;
  }

  applyGlobalShortcut(preferences: AppPreferences, persist: boolean) {
    if (!preferences.globalShortcutEnabled) {
      if (this.registeredShortcut) this.options.unregisterShortcut(this.registeredShortcut);
      this.registeredShortcut = "";
      this.shortcutState = { globalShortcutStatus: "disabled" };
      if (persist) this.save(preferences);
      return this.snapshot();
    }
    const validation = validateShortcut(preferences.globalShortcut);
    if (!validation.valid) {
      this.shortcutState = { globalShortcutStatus: "invalid", globalShortcutMessage: validation.message };
      return { ...this.snapshot(), ...this.shortcutState };
    }
    const accelerator = validation.accelerator;
    if (this.registeredShortcut === accelerator && this.options.isShortcutRegistered(accelerator)) {
      this.shortcutState = { globalShortcutStatus: "registered" };
      if (persist) this.save({ ...preferences, globalShortcut: accelerator });
      return this.snapshot();
    }
    if (!this.options.registerShortcut(accelerator, this.options.toggleMainWindow)) {
      this.shortcutState = { globalShortcutStatus: "unavailable", globalShortcutMessage: "快捷键已被其他应用占用" };
      return { ...this.snapshot(), ...this.shortcutState };
    }
    if (this.registeredShortcut) this.options.unregisterShortcut(this.registeredShortcut);
    this.registeredShortcut = accelerator;
    this.shortcutState = { globalShortcutStatus: "registered" };
    const normalized = { ...preferences, globalShortcut: accelerator };
    if (persist) this.save(normalized);
    return this.snapshot();
  }

  exportUiLayoutShareCode() {
    return encodeUiLayoutShareCode(this.load().uiLayout);
  }

  importUiLayoutShareCode(code: string) {
    const result = decodeUiLayoutShareCode(code.trim());
    if (!result.ok) throw new Error("分享码无效");
    this.save({ ...this.load(), uiLayout: result.preferences, showAppNames: result.preferences.showAppNames });
    return this.snapshot();
  }

  clearRegisteredShortcut() {
    this.registeredShortcut = "";
  }

  private loginItemEnabled() {
    return this.options.getLoginItemEnabled(this.options.loginExecutable(), this.options.loginArgs);
  }
}
