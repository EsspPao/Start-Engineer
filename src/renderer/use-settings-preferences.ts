import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AppPreferencesState, StartEngineerApi, UiLayoutPreferences, UiTheme, UpdatePreferencesInput, WallpaperGlassIntensity } from "../shared/types";
import { shortcutFromKeyboardEvent, validateShortcut } from "../shared/global-shortcut";
import { encodeUiLayoutShareCode } from "../shared/ui-layout-share";
import { cleanErrorMessage } from "./error-message";

type PreferenceSaveKind = "startup" | "close" | "shortcut" | "theme" | "layout" | "wallpaperIntensity" | "wallpaperVariant" | "wallpaperBackground" | "administrator" | "search" | "runningSort" | "appNames";
type SettingsSection = "general" | "theme";

type UseSettingsPreferencesOptions = {
  client: StartEngineerApi;
  preferences: AppPreferencesState;
  onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
  onWallpaperIntensityPreview: (value: WallpaperGlassIntensity) => void;
  onThemeChange: (theme: UiTheme) => Promise<AppPreferencesState>;
};

export function useSettingsPreferences({
  client,
  preferences,
  onPreferencesChange,
  onWallpaperIntensityPreview,
  onThemeChange,
}: UseSettingsPreferencesOptions) {
  const [expandedSettings, setExpandedSettings] = useState<Set<SettingsSection>>(new Set());
  const [savingPreference, setSavingPreference] = useState<PreferenceSaveKind | null>(null);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [layoutShareCode, setLayoutShareCode] = useState("");
  const wallpaperIntensitySaveTimer = useRef<number | null>(null);
  const latestWallpaperIntensity = useRef(preferences.wallpaperGlassIntensity);

  useEffect(() => {
    latestWallpaperIntensity.current = preferences.wallpaperGlassIntensity;
  }, [preferences.wallpaperGlassIntensity]);

  useEffect(() => () => {
    if (wallpaperIntensitySaveTimer.current) window.clearTimeout(wallpaperIntensitySaveTimer.current);
  }, []);

  const savePreference = async (kind: Exclude<PreferenceSaveKind, "theme">, input: UpdatePreferencesInput) => {
    setSavingPreference(kind);
    try {
      const result = await onPreferencesChange(input);
      setShortcutMessage(result.globalShortcutMessage ?? "");
    } catch {
      // The app-level toast reports the failure and restores optimistic state.
    } finally {
      setSavingPreference(null);
    }
  };

  const saveWallpaperIntensity = (value: WallpaperGlassIntensity, immediate = false) => {
    latestWallpaperIntensity.current = value;
    onWallpaperIntensityPreview(value);
    if (wallpaperIntensitySaveTimer.current) {
      window.clearTimeout(wallpaperIntensitySaveTimer.current);
      wallpaperIntensitySaveTimer.current = null;
    }
    const commit = () => {
      void savePreference("wallpaperIntensity", { wallpaperGlassIntensity: latestWallpaperIntensity.current });
    };
    if (immediate) commit();
    else wallpaperIntensitySaveTimer.current = window.setTimeout(commit, 160);
  };

  const flushWallpaperIntensity = () => saveWallpaperIntensity(latestWallpaperIntensity.current, true);
  const saveLayoutPreference = (input: Partial<UiLayoutPreferences>) => {
    const uiLayout = { ...preferences.uiLayout, ...input };
    void savePreference("layout", { uiLayout, showAppNames: uiLayout.showAppNames });
  };
  const changeUiScale = (value: number) => {
    saveLayoutPreference({ uiScale: Math.min(125, Math.max(80, Math.round(value))) });
  };

  const copyLayoutShareCode = () => {
    const code = encodeUiLayoutShareCode(preferences.uiLayout);
    setLayoutShareCode(code);
    void client.writeClipboardText(code)
      .then(() => setShortcutMessage("界面分享码已复制"))
      .catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "复制分享码失败")));
  };

  const importLayoutShareCode = () => {
    const code = layoutShareCode.trim() || window.prompt("粘贴界面分享码")?.trim();
    if (!code) return;
    void client.importUiLayoutShareCode(code)
      .then((next) => {
        setLayoutShareCode(code);
        setShortcutMessage("界面已导入");
        return onPreferencesChange({ uiLayout: next.uiLayout, showAppNames: next.uiLayout.showAppNames });
      })
      .catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "导入分享码失败")));
  };

  const selectTheme = async (theme: UiTheme) => {
    if (theme === preferences.uiTheme || savingPreference !== null) return;
    setSavingPreference("theme");
    try {
      await onThemeChange(theme);
    } catch {
      // The app-level toast reports the failure and restores the previous theme.
    } finally {
      setSavingPreference(null);
    }
  };

  const recordShortcut = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recordingShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecordingShortcut(false);
      setShortcutMessage("");
      return;
    }
    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    const validation = validateShortcut(shortcut);
    if (!validation.valid) {
      setShortcutMessage(validation.message);
      return;
    }
    setRecordingShortcut(false);
    setShortcutMessage("");
    void savePreference("shortcut", { globalShortcut: validation.accelerator, globalShortcutEnabled: true });
  };

  const setPreferences = (next: AppPreferencesState) => {
    void onPreferencesChange({ everythingCliPath: next.everythingCliPath });
  };

  const toggleSettingsSection = (section: SettingsSection) => {
    setExpandedSettings((current) => {
      const next = new Set(current);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  const administratorStatus = (preferences.administratorRestartRequired ? shortcutMessage : "")
    || preferences.administratorMessage
    || (preferences.administratorStatusLoading
      ? "权限状态检测中"
      : preferences.administratorRestartRequired
        ? "下次启动生效"
        : preferences.isRunningAsAdministrator
          ? "当前以管理员权限运行"
          : "当前以普通权限运行");

  return {
    administratorStatus,
    changeUiScale,
    copyLayoutShareCode,
    expandedSettings,
    flushWallpaperIntensity,
    importLayoutShareCode,
    layoutEditing,
    layoutShareCode,
    recordingShortcut,
    recordShortcut,
    saveLayoutPreference,
    savePreference,
    saveWallpaperIntensity,
    savingPreference,
    selectTheme,
    setLayoutEditing,
    setLayoutShareCode,
    setPreferences,
    setRecordingShortcut,
    setShortcutMessage,
    shortcutMessage,
    toggleSettingsSection,
  };
}
