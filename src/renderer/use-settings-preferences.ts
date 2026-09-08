import { useState, type KeyboardEvent } from "react";
import type { AppPreferencesState, UiLayoutPreferences, UpdatePreferencesInput } from "../shared/types";
import { shortcutFromKeyboardEvent, validateShortcut } from "../shared/global-shortcut";

type PreferenceSaveKind = "startup" | "close" | "shortcut" | "layout" | "administrator" | "search";
type SettingsSection = "advanced";
export type SettingsView = "preferences" | "groups";

type UseSettingsPreferencesOptions = {
  preferences: AppPreferencesState;
  onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
};

export function useSettingsPreferences({
  preferences,
  onPreferencesChange,
}: UseSettingsPreferencesOptions) {
  const [expandedSettings, setExpandedSettings] = useState<Set<SettingsSection>>(new Set());
  const [activeSettingsView, setActiveSettingsView] = useState<SettingsView>("preferences");
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [savingPreference, setSavingPreference] = useState<PreferenceSaveKind | null>(null);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const savePreference = async (kind: PreferenceSaveKind, input: UpdatePreferencesInput) => {
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

  const saveLayoutPreference = (input: Partial<UiLayoutPreferences>) => {
    const uiLayout = { ...preferences.uiLayout, ...input };
    void savePreference("layout", { uiLayout, showAppNames: uiLayout.showAppNames });
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

  const administratorStatus = shortcutMessage
    || preferences.administratorMessage
    || (preferences.isRunningAsAdministrator
      ? "主界面由 Windows 以管理员权限启动，资源管理器拖放受限"
      : preferences.elevatedTerminationStatus === "ready"
        ? "本次运行已授权；主界面仍为普通权限，拖放可用"
        : preferences.elevatedTerminationStatus === "starting"
          ? "正在请求本次运行的管理员授权"
          : preferences.runAsAdministrator
            ? "将在启动时预先授权；本次也可点击按钮明确授权"
            : "主界面保持普通权限；关闭高权限应用时按需请求 UAC");

  return {
    aboutDialogOpen,
    activeSettingsView,
    administratorStatus,
    expandedSettings,
    recordingShortcut,
    recordShortcut,
    saveLayoutPreference,
    savePreference,
    savingPreference,
    setAboutDialogOpen,
    setActiveSettingsView,
    setPreferences,
    setRecordingShortcut,
    setShortcutMessage,
    shortcutMessage,
    toggleSettingsSection,
  };
}
