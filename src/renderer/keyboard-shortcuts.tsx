export type KeyboardShortcutHelpItem = {
  keys: string;
  label: string;
};

export const keyboardShortcutHelpItems: KeyboardShortcutHelpItem[] = [
  { keys: "方向键 / WASD", label: "在应用卡片之间移动选择" },
  { keys: "Enter", label: "启动或唤起普通应用；展开合并卡片" },
  { keys: "Ctrl+Enter", label: "启动合并卡片内的全部应用" },
  { keys: "Esc", label: "关闭搜索、菜单、弹窗，或取消当前选择" },
  { keys: "Menu / Shift+F10", label: "打开当前应用更多菜单" },
  { keys: "F2", label: "重命名当前应用" },
  { keys: "Ctrl+↑/↓ / Ctrl+W/S", label: "切换上一个或下一个分组" },
  { keys: "Ctrl+1-9", label: "直接切换到第 1 至第 9 个应用分组" },
  { keys: "Ctrl+F", label: "聚焦搜索框" }
];

export function KeyboardShortcutPanel() {
  return <div className="shortcut-help-grid">
    {keyboardShortcutHelpItems.map((item) => <div className="shortcut-help-row" key={item.keys}>
      <kbd>{item.keys}</kbd>
      <span>{item.label}</span>
    </div>)}
  </div>;
}

const labels: Record<AppKeyboardShortcutId, [string, string]> = {
  up: ["向上移动", "选择上方应用卡片"], down: ["向下移动", "选择下方应用卡片"], left: ["向左移动", "选择左侧应用卡片"], right: ["向右移动", "选择右侧应用卡片"],
  activate: ["激活 / 展开", "启动或唤起普通应用，展开合并卡片"], launchFolder: ["启动卡片全部应用", "启动当前合并卡片内的全部应用"], cancel: ["取消 / 收起", "关闭搜索、菜单或放大的卡片"], edit: ["编辑应用", "编辑当前选择的应用"],
  menu: ["更多菜单", "打开当前应用的右键菜单"], search: ["聚焦搜索", "将焦点移到搜索框"], previousGroup: ["上一个分组", "切换到前一个应用分组"], nextGroup: ["下一个分组", "切换到后一个应用分组"],
  group1: ["第 1 分组", "直接切换到第 1 个分组"], group2: ["第 2 分组", "直接切换到第 2 个分组"], group3: ["第 3 分组", "直接切换到第 3 个分组"],
  group4: ["第 4 分组", "直接切换到第 4 个分组"], group5: ["第 5 分组", "直接切换到第 5 个分组"], group6: ["第 6 分组", "直接切换到第 6 个分组"],
  group7: ["第 7 分组", "直接切换到第 7 个分组"], group8: ["第 8 分组", "直接切换到第 8 个分组"], group9: ["第 9 分组", "直接切换到第 9 个分组"]
};

const sections: Array<{ id: string; title: string; shortcuts: AppKeyboardShortcutId[] }> = [
  { id: "actions", title: "常用操作", shortcuts: ["activate", "launchFolder", "edit", "menu", "search", "cancel"] },
  { id: "navigation", title: "导航", shortcuts: ["up", "down", "left", "right", "previousGroup", "nextGroup"] },
  { id: "groups", title: "分组直达", shortcuts: ["group1", "group2", "group3", "group4", "group5", "group6", "group7", "group8", "group9"] }
];

export function KeyboardShortcutSettingsSection({ shortcuts, onChange }: { shortcuts: AppPreferencesState["keyboardShortcuts"]; onChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState> }) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState<AppKeyboardShortcutId | null>(null);
  const [message, setMessage] = useState("");
  const record = (id: AppKeyboardShortcutId, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== id) return;
    event.preventDefault(); event.stopPropagation();
    const value = appShortcutFromEvent(event.nativeEvent);
    if (!isRecordableAppShortcut(value)) { setMessage("请选择非修饰键，且不要使用 Windows 键"); return; }
    const conflict = findShortcutConflict(shortcuts, value, id);
    if (conflict) { setMessage(`该按键已用于“${labels[conflict][0]}”`); return; }
    setRecording(null); setMessage(""); void onChange({ keyboardShortcuts: { ...shortcuts, [id]: [value] } });
  };
  return <section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><strong>快捷键</strong><small>双击按键即可修改。</small></span><ExpandIcon /></button>{expanded ? <div className="settings-collapse-content shortcut-settings-content"><div className="shortcut-settings-toolbar"><button className="shortcut-reset" onClick={() => { if (window.confirm("恢复全部应用内快捷键为默认设置？")) void onChange({ keyboardShortcuts: defaultKeyboardShortcuts }); }}>恢复全部默认</button></div><div className="shortcut-sections">{sections.map((section) => <section className={`shortcut-section shortcut-section-${section.id}`} key={section.id}><h3>{section.title}</h3><div className="shortcut-help-grid">{section.shortcuts.map((id) => <div className="shortcut-help-row" key={id} title={labels[id][1]}><span><strong>{labels[id][0]}</strong></span><button aria-label={`${labels[id][0]}，双击修改快捷键`} className={`shortcut-recorder ${recording === id ? "recording" : ""}`} onDoubleClick={() => { setRecording(id); setMessage("请按下新的快捷键"); }} onKeyDown={(event) => record(id, event)}>{recording === id ? "等待按键..." : shortcuts[id].join(" / ")}</button></div>)}</div></section>)}</div>{message ? <p className="shortcut-message">{message}</p> : null}</div> : null}</section>;
}

function ExpandIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="action-icon expand-chevron" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>;
}
import { useState } from "react";
import type { AppKeyboardShortcutId, AppPreferencesState, UpdatePreferencesInput } from "../shared/types";
import { appShortcutFromEvent, findShortcutConflict, isRecordableAppShortcut } from "../shared/app-shortcuts";
import { defaultKeyboardShortcuts } from "../main/preferences";
