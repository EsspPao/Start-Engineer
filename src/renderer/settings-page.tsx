import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { AppGroup, AppPreferencesState, StartEngineerApi, UpdatePreferencesInput } from "../shared/types";
import { AppearanceEditor } from "./appearance-editor";
import { cleanErrorMessage } from "./error-message";
import { GroupManagerItem, GroupSortPreview } from "./group-management";
import { KeyboardShortcutSettingsSection } from "./keyboard-shortcuts";
import { AboutSettingsDialog, SearchDependencySettings, SettingsCollapsibleSection } from "./settings-sections";
import { themeOptions } from "./theme-options";
import { Icon } from "./ui-icons";
import { useSettingsGroupDrag } from "./use-settings-group-drag";
import { useSettingsPreferences } from "./use-settings-preferences";
import type { RuntimeApp } from "./window-focus-feedback";
import { capturePointerForDrag } from "./pointer-drag-lifecycle";
export function SettingsPage({ client, apps, groups, preferences, onPreferencesChange, onAdd, onAddToGroup, onCreate, onEdit, onDelete, onReorder, onOpenApp, onAppContextMenu, onMoveApp }: {
    client: StartEngineerApi;
    apps: RuntimeApp[];
    groups: AppGroup[];
    preferences: AppPreferencesState;
    onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
    onAdd: () => void;
    onAddToGroup: (id: string) => void;
    onCreate: () => void;
    onEdit: (group: AppGroup) => void;
    onDelete: (id: string) => void;
    onReorder: (ids: string[]) => Promise<boolean>;
    onOpenApp: (app: RuntimeApp) => void;
    onAppContextMenu: (event: MouseEvent, app: RuntimeApp) => void;
    onMoveApp: (appId: string, groupId: string) => Promise<void>;
}) {
    const { ordered, expanded, sortPreview, appDrag, rows, sortCandidate, appCandidate, suppressAppClick, draggedApp, previewGroup, toggle } = useSettingsGroupDrag({ groups, apps, onReorder, onMoveApp });
    const { aboutDialogOpen, activeSettingsView, administratorStatus, expandedSettings, recordingShortcut, recordShortcut, saveLayoutPreference, savePreference, savingPreference, setAboutDialogOpen, setActiveSettingsView, setPreferences, setRecordingShortcut, setShortcutMessage, shortcutMessage, toggleSettingsSection } = useSettingsPreferences({ preferences, onPreferencesChange });
    const [studioOpen, setStudioOpen] = useState(false);
    const currentTheme = themeOptions.find((theme) => theme.id === preferences.uiTheme) ?? themeOptions[0];
    const handleSettingsTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const nextView = event.key === "ArrowLeft" || event.key === "Home" ? "preferences" : "groups";
      setActiveSettingsView(nextView);
      window.requestAnimationFrame(() => document.getElementById(`settings-tab-${nextView}`)?.focus());
    };
    const app = appDrag ?? { grabOffsetX: 0, grabOffsetY: 0 };
    const preferenceView = <div id="settings-panel-preferences" className="settings-preferences-view" role="tabpanel" aria-labelledby="settings-tab-preferences">
      <section className="settings-primary-section startup-operation-settings" aria-labelledby="startup-operation-heading">
        <header className="settings-section-heading"><span><strong id="startup-operation-heading">启动与操作</strong><small>只保留日常最常用的启动、关闭和唤出设置。</small></span></header>
        <div className="preference-grid">
          <div className="preference-row"><span><strong>开机启动</strong><small>登录 Windows 后快速打开；便携版首次开启时会准备本机启动缓存。</small></span><button className={`setting-switch ${preferences.launchAtStartup ? "enabled" : ""}`} role="switch" aria-checked={preferences.launchAtStartup} disabled={savingPreference !== null} onClick={() => void savePreference("startup", { launchAtStartup: !preferences.launchAtStartup })}><i /></button></div>
          <div className="preference-row close-preference"><span><strong>关闭主窗口时</strong><small>选择继续在托盘运行，或直接退出启动器。</small></span><div className="preference-options"><button className={preferences.closeBehavior === "tray" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "tray" })}>最小化到托盘</button><button className={preferences.closeBehavior === "quit" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "quit" })}>直接退出</button></div></div>
          <div className="preference-row shortcut-preference"><span><strong>快速唤出</strong><small>在任意界面按快捷键显示或隐藏 Start Engineer。</small>{shortcutMessage || preferences.globalShortcutMessage ? <em>{shortcutMessage || preferences.globalShortcutMessage}</em> : null}</span><div className="shortcut-controls"><button className={`shortcut-recorder ${recordingShortcut ? "recording" : ""}`} disabled={savingPreference !== null} onDoubleClick={() => { setRecordingShortcut(true); setShortcutMessage("请按下新的快捷键，Esc 取消"); }} onKeyDown={recordShortcut}>{recordingShortcut ? "等待按键…" : preferences.globalShortcut}</button><button className={`setting-switch ${preferences.globalShortcutEnabled ? "enabled" : ""}`} role="switch" aria-checked={preferences.globalShortcutEnabled} disabled={savingPreference !== null} onClick={() => void savePreference("shortcut", { globalShortcutEnabled: !preferences.globalShortcutEnabled })}><i /></button><button className="shortcut-reset" disabled={savingPreference !== null || preferences.globalShortcut === "Ctrl+Shift+Space"} onClick={() => void savePreference("shortcut", { globalShortcut: "Ctrl+Shift+Space", globalShortcutEnabled: true })}>恢复默认</button></div></div>
        </div>
      </section>

      <section className="settings-primary-section appearance-settings" aria-labelledby="appearance-heading">
        <header className="settings-section-heading"><span><strong id="appearance-heading">外观</strong><small>设计自己的界面，或通过分享码导入其他人的外观。</small></span></header>
        <div className="theme-summary">
          <span className={`theme-summary-preview theme-${currentTheme.id}`} aria-hidden="true"><span className="theme-preview"><i /><b /><em /></span></span>
          <span className="theme-summary-copy"><strong>{currentTheme.name}</strong><small>{currentTheme.description}</small></span>
          <button type="button" className="theme-details-toggle" aria-haspopup="dialog" onClick={() => setStudioOpen(true)}>自定义与分享</button>
        </div>

      </section>

      <SettingsCollapsibleSection className="advanced-settings" title="高级设置" description="应用名称、权限、快捷键和搜索依赖。" expanded={expandedSettings.has("advanced")} onToggle={() => toggleSettingsSection("advanced")}>
        <div className="preference-grid advanced-preference-grid">
          <div className="preference-row app-name-preference"><span><strong>显示应用名称</strong><small>在主界面卡片下方显示应用名称，关闭后只保留图标和状态。</small></span><button className={`setting-switch ${preferences.uiLayout.showAppNames ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showAppNames} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showAppNames: !preferences.uiLayout.showAppNames })}><i /></button></div>
          <div className="preference-row administrator-preference"><span><strong>启动时预先授权关闭高权限应用</strong><small>默认保持普通权限；仅在普通关闭失败时请求 UAC。开启后会在每次启动时授权一次，主界面仍保持普通权限和资源管理器拖放能力。</small><em className={preferences.elevatedTerminationStatus === "ready" ? "active" : "pending"}>{administratorStatus}</em></span><div className="administrator-controls">{preferences.administratorRestartRequired ? <button className="shortcut-reset administrator-restart" onClick={() => void client.restartWithConfiguredPrivileges().catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "管理员授权失败")))}>{preferences.elevatedTerminationStatus === "cancelled" || preferences.elevatedTerminationStatus === "failed" ? "重新授权" : "本次授权"}</button> : null}<button title="启动时预先授权关闭高权限应用" className={`setting-switch ${preferences.runAsAdministrator ? "enabled" : ""}`} role="switch" aria-checked={preferences.runAsAdministrator} disabled={savingPreference !== null} onClick={() => void savePreference("administrator", { runAsAdministrator: !preferences.runAsAdministrator })}><i /></button></div></div>
          <div className="preference-row search-preference"><span><strong>搜索范围</strong><small>默认调用 Everything 搜索文件；开启后只筛选 Start Engineer 内已添加的应用。</small><em>{preferences.searchProvider === "everything" ? "当前使用 Everything" : "当前仅搜索内部应用"}</em></span><button className={`setting-switch ${preferences.searchProvider === "internal" ? "enabled" : ""}`} role="switch" aria-checked={preferences.searchProvider === "internal"} disabled={savingPreference !== null} onClick={() => void savePreference("search", { searchProvider: preferences.searchProvider === "internal" ? "everything" : "internal" })}><i /></button></div>
        </div>
        <KeyboardShortcutSettingsSection shortcuts={preferences.keyboardShortcuts} onChange={onPreferencesChange}/>
        <SearchDependencySettings onPreferencesResolved={setPreferences} />
      </SettingsCollapsibleSection>

      <footer className="settings-footer"><button type="button" className="settings-about-trigger" aria-haspopup="dialog" onClick={() => setAboutDialogOpen(true)}>关于 Start Engineer</button></footer>
    </div>;

    const groupsView = <div id="settings-panel-groups" className="settings-groups-view" role="tabpanel" aria-labelledby="settings-tab-groups">
      <div className="settings-heading group-settings-heading"><div><h2>分组管理</h2><p>点击分组查看应用，拖动手柄调整左侧导航顺序。</p></div><div className="settings-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="launch" onClick={onCreate}>新建分组</button></div></div>
      <div className="group-manager">{ordered.map((group) => <GroupManagerItem key={group.id} group={group} apps={apps.filter((candidate) => candidate.groupId === group.id)} expanded={expanded.has(group.id)} sorting={sortPreview?.id === group.id} appDrag={appDrag} register={(element) => {
        if (element) rows.current.set(group.id, element);
        else rows.current.delete(group.id);
      }} onToggle={() => toggle(group.id)} onSortStart={(event) => {
        if (appCandidate.current) return;
        event.preventDefault();
        capturePointerForDrag(event.currentTarget, event.pointerId);
        const rect = rows.current.get(group.id)?.getBoundingClientRect();
        sortCandidate.current = { id: group.id, startX: event.clientX, startY: event.clientY, grabOffsetX: rect ? event.clientX - rect.left : 40, grabOffsetY: rect ? event.clientY - rect.top : 32, original: [...ordered], active: false, valid: true };
      }} onEdit={() => onEdit(group)} onDelete={() => onDelete(group.id)} canDelete={groups.length > 1} onAdd={() => onAddToGroup(group.id)} onOpenApp={(candidate) => {
        if (!suppressAppClick.current) onOpenApp(candidate);
      }} onAppContextMenu={onAppContextMenu} onAppPointerDown={(event, candidate) => {
        if (event.button !== 0 || sortCandidate.current) return;
        capturePointerForDrag(event.currentTarget, event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        appCandidate.current = { appId: candidate.id, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top };
      }}/>)}</div>
    </div>;

    return <section className="content settings-page no-drag" tabIndex={-1}>
      <div className="settings-view-tabs" role="tablist" aria-label="设置页面">
        <button type="button" id="settings-tab-preferences" className={`settings-view-tab ${activeSettingsView === "preferences" ? "selected" : ""}`} role="tab" aria-selected={activeSettingsView === "preferences"} aria-controls="settings-panel-preferences" tabIndex={activeSettingsView === "preferences" ? 0 : -1} onKeyDown={handleSettingsTabKeyDown} onClick={() => setActiveSettingsView("preferences")}>偏好</button>
        <button type="button" id="settings-tab-groups" className={`settings-view-tab ${activeSettingsView === "groups" ? "selected" : ""}`} role="tab" aria-selected={activeSettingsView === "groups"} aria-controls="settings-panel-groups" tabIndex={activeSettingsView === "groups" ? 0 : -1} onKeyDown={handleSettingsTabKeyDown} onClick={() => setActiveSettingsView("groups")}>分组管理</button>
      </div>
      {activeSettingsView === "preferences" ? preferenceView : groupsView}
      {studioOpen ? <AppearanceEditor preferences={preferences} apps={apps} client={client} onSave={onPreferencesChange} onClose={() => setStudioOpen(false)} /> : null}
      <AboutSettingsDialog open={aboutDialogOpen} onClose={() => setAboutDialogOpen(false)} />
      {sortPreview && previewGroup && typeof document !== "undefined" ? createPortal(<GroupSortPreview group={previewGroup} count={apps.filter((candidate) => candidate.groupId === previewGroup.id).length} left={sortPreview.left} top={sortPreview.top} width={sortPreview.width}/>, document.body) : null}
      {appDrag && draggedApp ? <div className="drag-preview no-drag" style={{ left: appDrag.x - app.grabOffsetX, top: appDrag.y - app.grabOffsetY }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt=""/> : <Icon name="grid"/>}<span>{draggedApp.name}</span></div> : null}
    </section>;
}
