import type { KeyboardEvent, MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { AppGroup, AppPreferencesState, StartEngineerApi, UiTheme, UpdatePreferencesInput, WallpaperGlassIntensity } from "../shared/types";
import { cleanErrorMessage } from "./error-message";
import { GroupManagerItem, GroupSortPreview } from "./group-management";
import { KeyboardShortcutSettingsSection } from "./keyboard-shortcuts";
import { AboutSettingsDialog, SearchDependencySettings, SettingsCollapsibleSection } from "./settings-sections";
import { WallpaperGlassIntensityControl, WallpaperGlassVariantControl } from "./theme-settings";
import { themeOptions } from "./theme-options";
import { Icon } from "./ui-icons";
import { useSettingsGroupDrag } from "./use-settings-group-drag";
import { useSettingsPreferences } from "./use-settings-preferences";
import type { RuntimeApp } from "./window-focus-feedback";
import { capturePointerForDrag } from "./pointer-drag-lifecycle";
export function SettingsPage({ client, apps, groups, preferences, onPreferencesChange, onWallpaperIntensityPreview, onThemeChange, onAdd, onAddToGroup, onCreate, onEdit, onDelete, onReorder, onOpenApp, onAppContextMenu, onMoveApp }: {
    client: StartEngineerApi;
    apps: RuntimeApp[];
    groups: AppGroup[];
    preferences: AppPreferencesState;
    onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
    onWallpaperIntensityPreview: (value: WallpaperGlassIntensity) => void;
    onThemeChange: (theme: UiTheme) => Promise<AppPreferencesState>;
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
    const { aboutDialogOpen, activeSettingsView, administratorStatus, changeUiScale, copyLayoutShareCode, expandedSettings, flushWallpaperIntensity, importLayoutShareCode, layoutEditing, layoutShareCode, recordingShortcut, recordShortcut, saveLayoutPreference, savePreference, saveWallpaperIntensity, savingPreference, selectTheme, setAboutDialogOpen, setActiveSettingsView, setLayoutEditing, setLayoutShareCode, setPreferences, setRecordingShortcut, setShortcutMessage, shortcutMessage, toggleSettingsSection } = useSettingsPreferences({ client, preferences, onPreferencesChange, onWallpaperIntensityPreview, onThemeChange });
    const themePicker = (<section className="theme-panel theme-presets">
      <header className="theme-subheading"><span><strong>主题预设</strong><small>快速切换整套视觉风格</small></span></header>
      <div className="theme-grid" role="radiogroup" aria-label="界面主题">
        {themeOptions.map((theme) => (<button key={theme.id} type="button" role="radio" aria-checked={preferences.uiTheme === theme.id} className={`theme-card theme-${theme.id} ${preferences.uiTheme === theme.id ? "selected" : ""}`} disabled={savingPreference !== null} title={theme.title ?? theme.description} onClick={() => void selectTheme(theme.id)}>
            <span className="theme-preview" aria-hidden="true"><i /><b /><em /></span>
            <span className="theme-card-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <span className="theme-check" aria-hidden="true">✓</span>
          </button>))}
      </div>
      {preferences.uiTheme === "wallpaper" ? <div className="wallpaper-controls"><WallpaperGlassVariantControl value={preferences.wallpaperGlassVariant} disabled={savingPreference !== null} onChange={(value) => void savePreference("wallpaperVariant", { wallpaperGlassVariant: value })}/><WallpaperGlassIntensityControl value={preferences.wallpaperGlassIntensity} disabled={savingPreference !== null && savingPreference !== "wallpaperIntensity"} onChange={(value) => saveWallpaperIntensity(value)} onCommit={flushWallpaperIntensity}/></div> : null}
    </section>);
    const layoutOption = <T extends string,>(label: string, value: T, current: T, onClick: (value: T) => void) => <button className={current === value ? "selected" : ""} disabled={savingPreference !== null} onClick={() => onClick(value)}>{label}</button>;
    const layoutEditor = (<section className={`theme-panel layout-editor ${layoutEditing ? "editing" : ""}`}>
      <div className="layout-editor-heading">
        <span><strong>界面编辑器</strong><small>{preferences.uiLayout.uiScale}% · {preferences.uiLayout.backgroundColor || "跟随主题背景"}</small></span>
        <button className={layoutEditing ? "ghost selected" : "launch"} onClick={() => setLayoutEditing((value) => !value)}>{layoutEditing ? "完成" : "编辑界面"}</button>
      </div>
      {layoutEditing ? <>
        <div className="layout-workbench">
          <div className="layout-preview" title="滚动鼠标滚轮调整界面比例" onWheel={(event) => { event.preventDefault(); changeUiScale(preferences.uiLayout.uiScale + (event.deltaY < 0 ? 2 : -2)); }}>
            <div className="layout-preview-shell" style={{ transform: `scale(${preferences.uiLayout.uiScale / 100})`, background: preferences.uiLayout.backgroundColor || undefined }}><i /><span><b /><b /><b /></span></div>
            <output>{preferences.uiLayout.uiScale}%</output>
          </div>
          <div className="layout-primary-controls">
            <div className="layout-control-block">
              <header><span><strong>界面比例</strong><small>80% - 125%</small></span><output>{preferences.uiLayout.uiScale}%</output></header>
              <div className="scale-control"><button title="缩小界面" aria-label="缩小界面" onClick={() => changeUiScale(preferences.uiLayout.uiScale - 2)}>−</button><input aria-label="界面比例" type="range" min="80" max="125" step="1" value={preferences.uiLayout.uiScale} onChange={(event) => changeUiScale(Number(event.target.value))}/><button title="放大界面" aria-label="放大界面" onClick={() => changeUiScale(preferences.uiLayout.uiScale + 2)}>+</button></div>
            </div>
            <div className="layout-control-block">
              <header><span><strong>背景颜色</strong><small>{preferences.uiLayout.backgroundColor || "使用主题默认颜色"}</small></span>{preferences.uiLayout.backgroundColor ? <button className="layout-color-reset" onClick={() => saveLayoutPreference({ backgroundColor: "" })}>跟随主题</button> : null}</header>
              <div className="color-control"><label className="color-picker" style={{ background: preferences.uiLayout.backgroundColor || "#EAF2FF" }}><input aria-label="选择背景颜色" type="color" value={preferences.uiLayout.backgroundColor || "#EAF2FF"} onChange={(event) => saveLayoutPreference({ backgroundColor: event.target.value.toUpperCase() })}/></label>{["#EAF2FF", "#F5F5F7", "#E9F7F5", "#F2ECFF", "#172033", "#0B111A"].map((color) => <button key={color} className={preferences.uiLayout.backgroundColor === color ? "selected" : ""} style={{ background: color }} title={color} aria-label={`背景颜色 ${color}`} onClick={() => saveLayoutPreference({ backgroundColor: color })}/>)}</div>
            </div>
          </div>
        </div>
        <div className="preference-grid layout-detail-grid">
        <div className="preference-row"><span><strong>卡片大小</strong><small>调整应用卡片的整体尺寸。</small></span><div className="preference-options">{layoutOption("小", "small", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}{layoutOption("中", "medium", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}{layoutOption("大", "large", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}</div></div>
        <div className="preference-row"><span><strong>网格密度</strong><small>控制应用之间的留白。</small></span><div className="preference-options">{layoutOption("紧凑", "compact", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}{layoutOption("标准", "standard", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}{layoutOption("宽松", "relaxed", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}</div></div>
        <div className="preference-row"><span><strong>侧栏宽度</strong><small>调整左侧导航区域宽度。</small></span><div className="preference-options">{layoutOption("窄", "narrow", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}{layoutOption("标准", "standard", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}{layoutOption("宽", "wide", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}</div></div>
        <div className="preference-row"><span><strong>顶部图标</strong><small>控制左上角标识大小。</small></span><div className="preference-options">{layoutOption("标准", "standard", preferences.uiLayout.brandIconSize, (value) => saveLayoutPreference({ brandIconSize: value }))}{layoutOption("大", "large", preferences.uiLayout.brandIconSize, (value) => saveLayoutPreference({ brandIconSize: value }))}</div></div>
        <div className="preference-row"><span><strong>显示搜索栏</strong><small>隐藏后仍可用设置重新打开。</small></span><button className={`setting-switch ${preferences.uiLayout.showSearchBar ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showSearchBar} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showSearchBar: !preferences.uiLayout.showSearchBar })}><i /></button></div>
        <div className="preference-row"><span><strong>显示运行状态</strong><small>控制卡片右上角运行绿点。</small></span><button className={`setting-switch ${preferences.uiLayout.showRunningStatus ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showRunningStatus} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showRunningStatus: !preferences.uiLayout.showRunningStatus })}><i /></button></div>
        <div className="preference-row"><span><strong>显示底部操作</strong><small>控制底部添加应用和关闭全部操作。</small></span><button className={`setting-switch ${preferences.uiLayout.showBatchActions ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showBatchActions} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showBatchActions: !preferences.uiLayout.showBatchActions })}><i /></button></div>
        </div>
        <div className="layout-share-panel"><span><strong>界面分享码</strong><small>不包含应用和本地路径</small>{shortcutMessage ? <em>{shortcutMessage}</em> : null}</span><input aria-label="界面分享码" value={layoutShareCode} placeholder="SEUI 分享码" onChange={(event) => setLayoutShareCode(event.target.value)}/><div><button className="shortcut-reset" onClick={importLayoutShareCode}>导入</button><button className="launch" onClick={copyLayoutShareCode}>生成并复制</button></div></div>
      </> : <div className="layout-editor-summary"><div className="layout-summary-scale"><b>{preferences.uiLayout.uiScale}</b><span>%</span></div><div className="layout-summary-swatch" style={{ background: preferences.uiLayout.backgroundColor || "linear-gradient(135deg,#dff5fb,#eee7fb)" }}/><span>{preferences.uiLayout.backgroundColor ? "自定义背景" : "主题背景"}</span></div>}
    </section>);
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
          <div className="preference-row"><span><strong>开机启动</strong><small>登录 Windows 后自动打开 Start Engineer 主窗口。</small></span><button className={`setting-switch ${preferences.launchAtStartup ? "enabled" : ""}`} role="switch" aria-checked={preferences.launchAtStartup} disabled={savingPreference !== null} onClick={() => void savePreference("startup", { launchAtStartup: !preferences.launchAtStartup })}><i /></button></div>
          <div className="preference-row close-preference"><span><strong>关闭主窗口时</strong><small>选择继续在托盘运行，或直接退出启动器。</small></span><div className="preference-options"><button className={preferences.closeBehavior === "tray" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "tray" })}>最小化到托盘</button><button className={preferences.closeBehavior === "quit" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "quit" })}>直接退出</button></div></div>
          <div className="preference-row shortcut-preference"><span><strong>快速唤出</strong><small>在任意界面按快捷键显示或隐藏 Start Engineer。</small>{shortcutMessage || preferences.globalShortcutMessage ? <em>{shortcutMessage || preferences.globalShortcutMessage}</em> : null}</span><div className="shortcut-controls"><button className={`shortcut-recorder ${recordingShortcut ? "recording" : ""}`} disabled={savingPreference !== null} onDoubleClick={() => { setRecordingShortcut(true); setShortcutMessage("请按下新的快捷键，Esc 取消"); }} onKeyDown={recordShortcut}>{recordingShortcut ? "等待按键…" : preferences.globalShortcut}</button><button className={`setting-switch ${preferences.globalShortcutEnabled ? "enabled" : ""}`} role="switch" aria-checked={preferences.globalShortcutEnabled} disabled={savingPreference !== null} onClick={() => void savePreference("shortcut", { globalShortcutEnabled: !preferences.globalShortcutEnabled })}><i /></button><button className="shortcut-reset" disabled={savingPreference !== null || preferences.globalShortcut === "Ctrl+Shift+Space"} onClick={() => void savePreference("shortcut", { globalShortcut: "Ctrl+Shift+Space", globalShortcutEnabled: true })}>恢复默认</button></div></div>
        </div>
      </section>

      <section className="settings-primary-section appearance-settings" aria-labelledby="appearance-heading">
        <header className="settings-section-heading"><span><strong id="appearance-heading">外观</strong><small>当前主题与界面布局。</small></span></header>
        <div className="theme-summary">
          <span className={`theme-summary-preview theme-${currentTheme.id}`} aria-hidden="true"><span className="theme-preview"><i /><b /><em /></span></span>
          <span className="theme-summary-copy"><strong>{currentTheme.name}</strong><small>{currentTheme.description}</small></span>
          <button type="button" className="theme-details-toggle" aria-expanded={expandedSettings.has("theme")} aria-controls="theme-details" onClick={() => toggleSettingsSection("theme")}>{expandedSettings.has("theme") ? "收起" : "更换主题"}</button>
        </div>
        {expandedSettings.has("theme") ? <div id="theme-details" className="theme-details">{themePicker}{layoutEditor}</div> : null}
      </section>

      <SettingsCollapsibleSection className="advanced-settings" title="高级设置" description="应用排序、名称、权限、快捷键和搜索依赖。" expanded={expandedSettings.has("advanced")} onToggle={() => toggleSettingsSection("advanced")}>
        <div className="preference-grid advanced-preference-grid">
          <div className="preference-row running-sort-preference"><span><strong>运行应用置顶</strong><small>分组内已启动应用自动显示在前面，关闭后恢复原有顺序。</small></span><button className={`setting-switch ${preferences.sortRunningAppsFirst ? "enabled" : ""}`} role="switch" aria-checked={preferences.sortRunningAppsFirst} disabled={savingPreference !== null} onClick={() => void savePreference("runningSort", { sortRunningAppsFirst: !preferences.sortRunningAppsFirst })}><i /></button></div>
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
      <AboutSettingsDialog open={aboutDialogOpen} onClose={() => setAboutDialogOpen(false)} />
      {sortPreview && previewGroup && typeof document !== "undefined" ? createPortal(<GroupSortPreview group={previewGroup} count={apps.filter((candidate) => candidate.groupId === previewGroup.id).length} left={sortPreview.left} top={sortPreview.top} width={sortPreview.width}/>, document.body) : null}
      {appDrag && draggedApp ? <div className="drag-preview no-drag" style={{ left: appDrag.x - app.grabOffsetX, top: appDrag.y - app.grabOffsetY }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt=""/> : <Icon name="grid"/>}<span>{draggedApp.name}</span></div> : null}
    </section>;
}
