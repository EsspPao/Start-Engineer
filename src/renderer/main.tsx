import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppEntry, AppGroup, AppMetrics, CommandDeckApi, GroupInput, ProcessInfo, SectionId, UpdateAppInput } from "../shared/types";
import "./styles.css";

type SortKey = "name" | "cpuPercent" | "memoryBytes" | "diskBytesPerSecond";
type ProcessFilter = "all" | "managed";
type AppGroupId = AppEntry["groupId"];
type RuntimeApp = AppEntry & { metrics: AppMetrics };
type DisplayProcess = ProcessInfo & { isEnded?: boolean };
type MenuState =
  | { kind: "process"; x: number; y: number; process: ProcessInfo }
  | { kind: "app"; x: number; y: number; appId: string }
  | { kind: "group"; x: number; y: number; groupId: string }
  | null;
type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> } | null;
type EditState = { id: string; name: string; launchArgs: string; workingDirectory: string } | null;
type DragState = { appId: string; x: number; y: number; targetGroup?: AppGroupId } | null;
type GroupEditState = { id?: string; name: string; icon: string } | null;
type GroupDeleteState = { groupId: string; targetGroupId: string } | null;

const fallbackGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
const groupIcons = ["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"];

const electronOnly = () => Promise.reject(new Error("此操作需要在 Electron 应用窗口中运行"));
const fallbackApi: CommandDeckApi = {
  listGroups: async () => fallbackGroups,
  createGroup: electronOnly,
  updateGroup: electronOnly,
  reorderGroups: electronOnly,
  removeGroup: electronOnly,
  listApps: async () => [],
  addAppFromDialog: electronOnly,
  pickExecutable: electronOnly,
  updateApp: async () => [],
  setAppGroup: async () => [],
  launchApp: electronOnly,
  killApp: async () => [],
  removeApp: async () => [],
  killProcessGroup: async () => electronOnly(),
  showItemInFolder: async () => electronOnly(),
  writeClipboardText: async () => electronOnly(),
  getMetricsSnapshot: async () => [],
  getProcessSnapshot: async () => [],
  getRuntimeSnapshot: async () => ({ apps: [], metrics: [], processes: [] }),
  windowAction: async () => electronOnly()
};

const api = () => window.commandDeck ?? fallbackApi;
const emptyMetrics = (appId: string): AppMetrics => ({ appId, isRunning: false, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [] });
const formatMemory = (bytes: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "--");
const formatDisk = (bytes: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB/s` : "0.0 MB/s");
const initials = (name: string) => [...name].filter((char) => /\p{L}|\p{N}/u.test(char)).slice(0, 2).join("").toUpperCase() || "APP";
const cleanErrorMessage = (reason: unknown, fallback = "操作失败") => {
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : fallback;
  return message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || fallback;
};

function App() {
  const [groups, setGroups] = useState(fallbackGroups);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [metrics, setMetrics] = useState<AppMetrics[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("processes");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("all");
  const [menu, setMenu] = useState<MenuState>(null);
  const [lockedProcessName, setLockedProcessName] = useState("");
  const [lockedProcessOrder, setLockedProcessOrder] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [edit, setEdit] = useState<EditState>(null);
  const [groupEdit, setGroupEdit] = useState<GroupEditState>(null);
  const [groupDelete, setGroupDelete] = useState<GroupDeleteState>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [error, setError] = useState("");
  const dragCandidate = useRef<{ appId: string; startX: number; startY: number } | null>(null);
  const runtimeApps = useMemo<RuntimeApp[]>(() => apps.map((item) => ({ ...item, metrics: metrics.find((metric) => metric.appId === item.id) ?? emptyMetrics(item.id) })), [apps, metrics]);
  const appGroups = useMemo(() => groups.filter((group) => !group.isSystem).sort((a, b) => a.order - b.order), [groups]);
  const closeMenu = useCallback(() => {
    setMenu(null);
    setLockedProcessName("");
    setLockedProcessOrder([]);
  }, []);

  const refreshRuntimeData = useCallback(async () => {
    try {
      const snapshot = await api().getRuntimeSnapshot();
      setApps(snapshot.apps);
      setMetrics(snapshot.metrics);
      setProcesses(snapshot.processes);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "资源监控刷新失败"));
    }
  }, []);

  useEffect(() => {
    void Promise.all([api().listGroups(), api().listApps()]).then(([nextGroups, nextApps]) => {
      setGroups(nextGroups.length ? nextGroups : fallbackGroups);
      setApps(nextApps);
    }).catch((reason) => setError(cleanErrorMessage(reason, "基础数据加载失败")));
    void refreshRuntimeData();
    const timer = window.setInterval(refreshRuntimeData, 1500);
    return () => window.clearInterval(timer);
  }, [refreshRuntimeData]);

  useEffect(() => {
    window.addEventListener("blur", closeMenu);
    return () => window.removeEventListener("blur", closeMenu);
  }, [closeMenu]);

  const runAppAction = useCallback(async (action: () => Promise<AppEntry[]>) => {
    try {
      setError("");
      setApps(await action());
      await refreshRuntimeData();
    } catch (reason) {
      setError(cleanErrorMessage(reason));
    }
  }, [refreshRuntimeData]);

  const moveAppToGroup = useCallback(async (appId: string, targetGroup: AppGroupId) => {
    const current = apps.find((item) => item.id === appId);
    if (!current || current.groupId === targetGroup) return;
    try {
      setApps(await api().setAppGroup(appId, targetGroup));
      setActiveSection(targetGroup);
      setSelectedAppId(appId);
      setSearchDraft("");
      setQuery("");
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);
  const moveAppWithinSettings = useCallback(async (appId: string, targetGroup: AppGroupId) => {
    const current = apps.find((item) => item.id === appId);
    if (!current || current.groupId === targetGroup) return;
    try {
      setApps(await api().setAppGroup(appId, targetGroup));
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);

  useEffect(() => {
    const cancelDrag = () => { dragCandidate.current = null; setDrag(null); };
    const onMove = (event: PointerEvent) => {
      const candidate = dragCandidate.current;
      if (!candidate) return;
      if (!drag && Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) <= 6) return;
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-drop-group]");
      const targetGroup = node?.dataset.dropGroup as AppGroupId | undefined;
      const app = apps.find((item) => item.id === candidate.appId);
      setDrag({ appId: candidate.appId, x: event.clientX, y: event.clientY, targetGroup: targetGroup && app?.groupId !== targetGroup ? targetGroup : undefined });
    };
    const onUp = () => {
      const current = drag;
      dragCandidate.current = null;
      setDrag(null);
      if (current?.targetGroup) void moveAppToGroup(current.appId, current.targetGroup);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        setConfirm(null);
        setEdit(null);
        setGroupEdit(null);
        setGroupDelete(null);
        cancelDrag();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [apps, closeMenu, drag, moveAppToGroup]);

  const visibleApps = runtimeApps.filter((item) => item.groupId === activeSection && `${item.name} ${item.category} ${item.executablePath}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleProcesses = useMemo<DisplayProcess[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const direction = sortDirection === "asc" ? 1 : -1;
    const sorted = processes
      .filter((item) => processFilter === "all" || item.isManagedApp)
      .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => sortKey === "name" ? a.name.localeCompare(b.name) * direction : (a[sortKey] - b[sortKey]) * direction);

    if (!lockedProcessName || lockedProcessOrder.length === 0) return sorted;

    const byName = new Map(sorted.map((item) => [item.name.toLowerCase(), item as DisplayProcess]));
    if (!byName.has(lockedProcessName) && menu?.kind === "process") {
      byName.set(lockedProcessName, {
        ...menu.process,
        cpuPercent: 0,
        memoryBytes: 0,
        diskBytesPerSecond: 0,
        canTerminate: false,
        terminationBlockedReason: "进程已结束",
        isEnded: true
      });
    }

    const ordered = lockedProcessOrder.flatMap((name) => {
      const item = byName.get(name);
      if (!item) return [];
      byName.delete(name);
      return [item];
    });
    return [...ordered, ...byName.values()];
  }, [lockedProcessName, lockedProcessOrder, menu, processFilter, processes, query, sortDirection, sortKey]);
  const selectedApp = runtimeApps.find((item) => item.id === selectedAppId);
  const draggedApp = runtimeApps.find((item) => item.id === drag?.appId);
  const processMenuItem: DisplayProcess | undefined = menu?.kind === "process"
    ? processes.find((item) => item.name.toLowerCase() === menu.process.name.toLowerCase()) ?? {
      ...menu.process,
      cpuPercent: 0,
      memoryBytes: 0,
      diskBytesPerSecond: 0,
      canTerminate: false,
      terminationBlockedReason: "进程已结束",
      isEnded: true
    }
    : undefined;

  const switchSection = (id: SectionId) => {
    if (drag) return;
    setActiveSection(id);
    setSearchDraft("");
    setQuery("");
    closeMenu();
    if (appGroups.some((group) => group.id === id)) setSelectedAppId(runtimeApps.find((item) => item.groupId === id)?.id ?? "");
  };
  const changeSort = (key: SortKey) => {
    closeMenu();
    if (key === sortKey) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "name" ? "asc" : "desc"); }
  };
  const openMenu = (next: Exclude<MenuState, null>) => {
    setMenu({ ...next, x: Math.min(next.x, window.innerWidth - 250), y: Math.min(next.y, window.innerHeight - 430) });
  };
  const openProcessMenu = (event: React.MouseEvent, process: ProcessInfo) => {
    event.preventDefault();
    event.stopPropagation();
    setLockedProcessName(process.name.toLowerCase());
    setLockedProcessOrder(visibleProcesses.map((item) => item.name.toLowerCase()));
    openMenu({ kind: "process", x: event.clientX, y: event.clientY, process });
  };
  const submitSearch = () => {
    closeMenu();
    setQuery(searchDraft);
  };
  const changeProcessFilter = (value: ProcessFilter) => {
    closeMenu();
    setProcessFilter(value);
  };
  const addApp = () => {
    const groupId = appGroups.some((group) => group.id === activeSection) ? activeSection : appGroups[0]?.id;
    if (!groupId) return;
    void runAppAction(() => api().addAppFromDialog(groupId));
  };
  const launchApp = async (id: string) => {
    try {
      setError("");
      const result = await api().launchApp(id);
      setApps(result.apps);
      if (result.status === "failed") {
        setError(result.message || "启动失败，请检查程序路径和启动参数。");
        return;
      }
      if (result.status === "launched") {
        await refreshRuntimeData();
      }
    } catch (reason) {
      setError(cleanErrorMessage(reason, "启动失败，请检查程序路径和启动参数。"));
    }
  };
  const editApp = (app: AppEntry) => setEdit({ id: app.id, name: app.name, launchArgs: app.launchArgs ?? "", workingDirectory: app.workingDirectory ?? "" });
  const saveGroup = async (input: GroupInput & { id?: string }) => {
    try {
      setError("");
      const next = input.id
        ? await api().updateGroup({ id: input.id, name: input.name, icon: input.icon })
        : await api().createGroup({ name: input.name, icon: input.icon });
      setGroups(next);
      setGroupEdit(null);
    } catch (reason) {
      throw new Error(cleanErrorMessage(reason, "保存分组失败"));
    }
  };
  const reorderGroups = async (ids: string[]) => {
    try { setGroups(await api().reorderGroups(ids)); return true; }
    catch (reason) { setError(cleanErrorMessage(reason, "分组排序失败")); return false; }
  };
  const removeGroup = async () => {
    if (!groupDelete) return;
    try {
      const result = await api().removeGroup(groupDelete.groupId, groupDelete.targetGroupId);
      setGroups(result.groups);
      setApps(result.apps);
      setGroupDelete(null);
      if (activeSection === groupDelete.groupId) {
        setActiveSection(result.targetGroupId);
        setSelectedAppId(result.apps.find((item) => item.groupId === result.targetGroupId)?.id ?? "");
      }
    } catch (reason) {
      setError(cleanErrorMessage(reason, "删除分组失败"));
    }
  };
  const requestDeleteGroup = (groupId: string) => {
    const target = appGroups.find((group) => group.id !== groupId);
    if (!target) { setError("至少需要保留一个应用分组"); return; }
    closeMenu();
    setGroupDelete({ groupId, targetGroupId: target.id });
  };

  return (
    <main className="app-shell drag-region" onPointerDown={closeMenu}>
      <aside className="sidebar no-drag">
        <div className="brand"><div className="brand-mark">★</div><span>Star Engineer</span></div>
        <nav className="nav">
          {groups.filter((group) => group.id !== "settings").map((group) => {
            const acceptsDrop = !group.isSystem;
            const sourceGroup = draggedApp?.groupId;
            return <button key={group.id} data-drop-group={acceptsDrop ? group.id : undefined} className={`nav-button ${activeSection === group.id ? "active" : ""} ${drag && acceptsDrop ? "drop-ready" : ""} ${drag?.targetGroup === group.id ? "drop-active" : ""} ${drag && sourceGroup === group.id ? "drop-disabled" : ""}`} onClick={() => switchSection(group.id)} onContextMenu={(event) => { if (group.isSystem) return; event.preventDefault(); event.stopPropagation(); openMenu({ kind: "group", x: event.clientX, y: event.clientY, groupId: group.id }); }}>
              <Icon name={group.icon} /><span>{drag?.targetGroup === group.id ? `移动到${group.name}` : group.name}</span>
            </button>;
          })}
        </nav>
        <button className={`nav-button settings ${activeSection === "settings" ? "active" : ""}`} onClick={() => switchSection("settings")}><Icon name="settings" /><span>设置</span></button>
      </aside>

      <section className="window">
        <header className="titlebar"><div /><div className="window-controls no-drag">
          <button title="最小化" aria-label="最小化" onClick={() => void api().windowAction("minimize")}>−</button>
          <button title="最大化或还原" aria-label="最大化或还原" onClick={() => void api().windowAction("maximize")}>□</button>
          <button title="关闭" aria-label="关闭" className="close" onClick={() => void api().windowAction("close")}>×</button>
        </div></header>
        <section className="searchbar no-drag"><label><Icon name="search" /><input value={searchDraft} onFocus={closeMenu} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitSearch()} placeholder="搜索..." /></label><button className="search-button" onClick={submitSearch}><Icon name="search" />搜索</button></section>

        {activeSection === "processes" ? <ProcessPage processes={visibleProcesses} lockedProcessName={lockedProcessName} sortKey={sortKey} sortDirection={sortDirection} changeSort={changeSort} filter={processFilter} setFilter={changeProcessFilter} onContextMenu={openProcessMenu} />
          : activeSection === "settings" ? <SettingsPage apps={runtimeApps} groups={appGroups} onAdd={addApp} onAddToGroup={(groupId) => void runAppAction(() => api().addAppFromDialog(groupId))} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} onOpenApp={(app) => { setActiveSection(app.groupId); setSelectedAppId(app.id); }} onAppContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onMoveApp={moveAppWithinSettings} />
          : <GroupPage apps={visibleApps} selectedAppId={selectedAppId} draggingAppId={drag?.appId} onSelect={setSelectedAppId} onLaunch={() => selectedApp && launchApp(selectedApp.id)} onAdd={addApp} onPickExecutable={() => selectedApp && void runAppAction(() => api().pickExecutable(selectedApp.id))} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onPointerDown={(event, app) => { if (event.button !== 0) return; dragCandidate.current = { appId: app.id, startX: event.clientX, startY: event.clientY }; }} />}
        {error ? <button className="toast no-drag" onClick={() => setError("")}>{error}</button> : null}
      </section>

      {menu?.kind === "process" && processMenuItem ? <ProcessContextMenu state={menu} process={processMenuItem} onClose={closeMenu} onConfirm={setConfirm} onError={setError} /> : null}
      {menu?.kind === "app" ? <AppContextMenu state={menu} app={runtimeApps.find((item) => item.id === menu.appId)} groups={appGroups} onClose={closeMenu} onLaunch={launchApp} onKill={(app) => setConfirm({ title: "结束应用进程", message: `确定结束 ${app.name} 的全部相关进程吗？`, confirmLabel: "结束进程", onConfirm: async () => { await runAppAction(() => api().killApp(app.id)); } })} onPick={(app) => void runAppAction(() => api().pickExecutable(app.id))} onEdit={editApp} onMove={activeSection === "settings" ? moveAppWithinSettings : moveAppToGroup} onRemove={(app) => setConfirm({ title: "移除应用", message: `确定从 Star Engineer 中移除 ${app.name} 吗？本地程序文件不会被删除。`, confirmLabel: "移除应用", onConfirm: async () => { await runAppAction(() => api().removeApp(app.id)); setSelectedAppId(""); } })} onError={setError} /> : null}
      {menu?.kind === "group" ? <GroupContextMenu state={menu} groups={appGroups} onClose={closeMenu} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} /> : null}
      {confirm ? <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} onError={setError} /> : null}
      {edit ? <AppEditDialog state={edit} onClose={() => setEdit(null)} onSave={(input) => runAppAction(() => api().updateApp(input))} /> : null}
      {groupEdit ? <GroupEditDialog state={groupEdit} onClose={() => setGroupEdit(null)} onSave={saveGroup} /> : null}
      {groupDelete ? <GroupDeleteDialog state={groupDelete} groups={appGroups} appCount={apps.filter((item) => item.groupId === groupDelete.groupId).length} onChangeTarget={(targetGroupId) => setGroupDelete({ ...groupDelete, targetGroupId })} onClose={() => setGroupDelete(null)} onConfirm={removeGroup} /> : null}
      {drag && draggedApp ? <div className="drag-preview no-drag" style={{ left: drag.x + 14, top: drag.y + 14 }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}
    </main>
  );
}

function ProcessPage({ processes, lockedProcessName, sortKey, sortDirection, changeSort, filter, setFilter, onContextMenu }: { processes: DisplayProcess[]; lockedProcessName: string; sortKey: SortKey; sortDirection: "asc" | "desc"; changeSort: (key: SortKey) => void; filter: ProcessFilter; setFilter: (value: ProcessFilter) => void; onContextMenu: (event: React.MouseEvent, process: ProcessInfo) => void }) {
  return <section className="content no-drag"><div className="table-toolbar"><div className="segmented"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>全部进程</button><button className={filter === "managed" ? "selected" : ""} onClick={() => setFilter("managed")}>已管理应用</button></div></div><div className="process-table">
    <div className="process-row header"><button onClick={() => changeSort("name")}>进程 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("name")}>名称 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("cpuPercent")}>CPU <SortMark active={sortKey === "cpuPercent"} direction={sortDirection} /></button><button onClick={() => changeSort("memoryBytes")}>内存 <SortMark active={sortKey === "memoryBytes"} direction={sortDirection} /></button><button onClick={() => changeSort("diskBytesPerSecond")}>磁盘 <SortMark active={sortKey === "diskBytesPerSecond"} direction={sortDirection} /></button></div>
    {processes.map((process) => <div className={`process-row ${process.name.toLowerCase() === lockedProcessName ? "locked" : ""} ${process.isEnded ? "ended" : ""}`} key={process.name.toLowerCase()} onContextMenu={(event) => onContextMenu(event, process)}><div className="process-icon">{process.iconDataUrl ? <img src={process.iconDataUrl} alt="" /> : initials(process.name)}</div><div><p>{process.name}</p><span title={`PID: ${process.pids.join(", ")}`}>{process.isEnded ? "已结束" : process.processCount > 1 ? `${process.processCount} 个进程` : `PID ${process.pid}`}</span></div><span>{process.isEnded ? "--" : `${process.cpuPercent.toFixed(1)}%`}</span><span>{process.isEnded ? "--" : formatMemory(process.memoryBytes)}</span><span>{process.isEnded ? "--" : formatDisk(process.diskBytesPerSecond)}</span></div>)}
  </div></section>;
}

function GroupPage({ apps, selectedAppId, draggingAppId, onSelect, onLaunch, onAdd, onPickExecutable, onContextMenu, onPointerDown }: { apps: RuntimeApp[]; selectedAppId: string; draggingAppId?: string; onSelect: (id: string) => void; onLaunch: () => void; onAdd: () => void; onPickExecutable: () => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  const selected = apps.find((item) => item.id === selectedAppId);
  return <section className="content group-content no-drag"><div className="app-grid">{apps.map((app) => <button key={app.id} className={`app-card ${app.id === selectedAppId ? "selected" : ""} ${app.id === draggingAppId ? "dragging" : ""}`} onClick={() => !draggingAppId && onSelect(app.id)} onContextMenu={(event) => onContextMenu(event, app)} onPointerDown={(event) => onPointerDown(event, app)}><div className="card-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <Icon name="grid" />}</div><span>{app.name}</span>{app.metrics.isRunning ? <i>运行中</i> : null}</button>)}</div><div className="group-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="ghost" onClick={onPickExecutable} disabled={!selected}>选择程序</button><button className="launch" onClick={onLaunch} disabled={!selected}><Icon name="play" />启动</button></div></section>;
}

function ProcessContextMenu({ state, process, onClose, onConfirm, onError }: { state: Extract<MenuState, { kind: "process" }>; process: DisplayProcess; onClose: () => void; onConfirm: (value: ConfirmState) => void; onError: (message: string) => void }) {
  const item = process;
  const copy = async (value: string) => { try { await api().writeClipboardText(value); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "复制失败"); } };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{item.name}</strong><span>{item.isEnded ? "进程已结束" : `${item.processCount} 个进程`}</span></div><MenuDivider /><MenuButton disabled={!item.canTerminate || item.isEnded} title={item.terminationBlockedReason} danger onClick={() => { onClose(); onConfirm({ title: "结束进程组", message: `确定结束 ${item.name} 的 ${item.pids.length} 个进程吗？`, confirmLabel: "结束进程组", onConfirm: () => api().killProcessGroup({ name: item.name, pids: item.pids }) }); }}>结束进程组</MenuButton><MenuButton disabled={!item.exePath} onClick={() => { onClose(); if (item.exePath) void api().showItemInFolder(item.exePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => void copy(item.name)}>复制进程名称</MenuButton><MenuButton disabled={!item.exePath} onClick={() => item.exePath && void copy(item.exePath)}>复制文件路径</MenuButton><MenuButton disabled={item.isEnded} onClick={() => void copy(item.pids.join(", "))}>复制 PID</MenuButton></ContextMenu>;
}

function AppContextMenu({ state, app, groups, onClose, onLaunch, onKill, onPick, onEdit, onMove, onRemove, onError }: { state: Extract<MenuState, { kind: "app" }>; app?: RuntimeApp; groups: AppGroup[]; onClose: () => void; onLaunch: (id: string) => void; onKill: (app: RuntimeApp) => void; onPick: (app: RuntimeApp) => void; onEdit: (app: RuntimeApp) => void; onMove: (id: string, group: AppGroupId) => Promise<void>; onRemove: (app: RuntimeApp) => void; onError: (message: string) => void }) {
  if (!app) return null;
  const invoke = (action: () => void) => { onClose(); action(); };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><MenuButton onClick={() => invoke(() => onLaunch(app.id))}>启动</MenuButton><MenuButton disabled={!app.metrics.isRunning} danger onClick={() => invoke(() => onKill(app))}>结束进程</MenuButton><MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().showItemInFolder(app.executablePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => invoke(() => onPick(app))}>修改启动程序</MenuButton><MenuButton onClick={() => invoke(() => onEdit(app))}>编辑应用信息</MenuButton><div className="menu-label">移动到分组</div>{groups.map((group) => <MenuButton key={group.id} disabled={app.groupId === group.id} onClick={() => { onClose(); void onMove(app.id, group.id); }}>{group.name}{app.groupId === group.id ? "（当前）" : ""}</MenuButton>)}<MenuDivider /><MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().writeClipboardText(app.executablePath).catch((reason) => onError(reason.message)); }}>复制程序路径</MenuButton><MenuButton danger onClick={() => invoke(() => onRemove(app))}>移除应用</MenuButton></ContextMenu>;
}

function GroupContextMenu({ state, groups, onClose, onCreate, onEdit, onDelete, onReorder }: { state: Extract<MenuState, { kind: "group" }>; groups: AppGroup[]; onClose: () => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<unknown> }) {
  const index = groups.findIndex((group) => group.id === state.groupId);
  const group = groups[index];
  if (!group) return null;
  const move = (offset: number) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    const next = [...groups];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onClose();
    void onReorder(next.map((item) => item.id));
  };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{group.name}</strong><span>应用分组</span></div><MenuDivider /><MenuButton onClick={() => { onClose(); onEdit(group); }}>重命名 / 更换图标</MenuButton><MenuButton onClick={() => { onClose(); onCreate(); }}>新建分组</MenuButton><MenuButton disabled={index === 0} onClick={() => move(-1)}>上移</MenuButton><MenuButton disabled={index === groups.length - 1} onClick={() => move(1)}>下移</MenuButton><MenuDivider /><MenuButton danger disabled={groups.length <= 1} onClick={() => onDelete(group.id)}>删除分组</MenuButton></ContextMenu>;
}

function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) { return <div className="context-menu no-drag" style={{ left: x, top: Math.max(8, y) }} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>{children}<button className="menu-dismiss" aria-label="关闭菜单" onClick={onClose} /></div>; }
function MenuButton({ disabled, danger, title, onClick, children }: { disabled?: boolean; danger?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) { return <button className={`menu-item ${danger ? "danger" : ""}`} disabled={disabled} title={title} onClick={onClick}>{children}</button>; }
function MenuDivider() { return <div className="menu-divider" />; }

function ConfirmDialog({ state, onClose, onError }: { state: NonNullable<ConfirmState>; onClose: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); try { await state.onConfirm(); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "操作失败"); setBusy(false); } };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog" onPointerDown={(event) => event.stopPropagation()}><h2>{state.title}</h2><p>{state.message}</p><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" onClick={() => void confirm()} disabled={busy}>{busy ? "处理中..." : state.confirmLabel}</button></div></div></div>;
}
function AppEditDialog({ state, onClose, onSave }: { state: EditState; onClose: () => void; onSave: (input: UpdateAppInput) => Promise<void> }) {
  const [form, setForm] = useState(state!);
  const [busy, setBusy] = useState(false);
  if (!form) return null;
  const save = async () => { if (!form.name.trim()) return; setBusy(true); await onSave({ id: form.id, name: form.name.trim(), launchArgs: form.launchArgs.trim() || undefined, workingDirectory: form.workingDirectory.trim() || undefined }); onClose(); };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>编辑应用信息</h2><label>名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>启动参数<input value={form.launchArgs} onChange={(event) => setForm({ ...form, launchArgs: event.target.value })} placeholder="例如：--silent" /></label><label>工作目录<input value={form.workingDirectory} onChange={(event) => setForm({ ...form, workingDirectory: event.target.value })} placeholder="留空则使用程序所在目录" /></label><div className="dialog-actions"><button type="button" className="ghost" onClick={onClose}>取消</button><button type="submit" className="launch" disabled={busy || !form.name.trim()}>保存</button></div></form></div>;
}
function SettingsPage({ apps, groups, onAdd, onAddToGroup, onCreate, onEdit, onDelete, onReorder, onOpenApp, onAppContextMenu, onMoveApp }: { apps: RuntimeApp[]; groups: AppGroup[]; onAdd: () => void; onAddToGroup: (id: string) => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<boolean>; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onMoveApp: (appId: string, groupId: string) => Promise<void> }) {
  const [ordered, setOrdered] = useState(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortPreview, setSortPreview] = useState<{ id: string; left: number; top: number; width: number } | null>(null);
  const [appDrag, setAppDrag] = useState<{ appId: string; x: number; y: number; targetGroup?: string } | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const flipRects = useRef(new Map<string, DOMRect>());
  const latestOrdered = useRef(ordered);
  const sortCandidate = useRef<{ id: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; original: AppGroup[]; active: boolean; valid: boolean } | null>(null);
  const appCandidate = useRef<{ appId: string; startX: number; startY: number } | null>(null);
  const suppressAppClick = useRef(false);

  useEffect(() => {
    setOrdered(groups);
    setExpanded((current) => new Set([...current].filter((id) => groups.some((group) => group.id === id))));
  }, [groups]);
  useEffect(() => { latestOrdered.current = ordered; }, [ordered]);

  const captureRects = () => {
    flipRects.current = new Map([...rows.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    if (!flipRects.current.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, element] of rows.current) {
      const before = flipRects.current.get(id);
      if (!before) continue;
      const after = element.getBoundingClientRect();
      const delta = before.top - after.top;
      if (!delta) continue;
      element.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    flipRects.current.clear();
  }, [ordered]);

  useEffect(() => {
    const cancelSort = () => {
      const candidate = sortCandidate.current;
      sortCandidate.current = null;
      setSortPreview(null);
      if (candidate?.active) setOrdered(candidate.original);
    };
    const cancelApp = () => { appCandidate.current = null; setAppDrag(null); };
    const move = (event: PointerEvent) => {
      const sort = sortCandidate.current;
      if (sort) {
        if (!sort.active && Math.hypot(event.clientX - sort.startX, event.clientY - sort.startY) <= 6) return;
        sort.active = true;
        const source = rows.current.get(sort.id);
        if (!source) return;
        const sourceRect = source.getBoundingClientRect();
        const previewWidth = Math.min(sourceRect.width, 520);
        const previewHeight = 64;
        const left = Math.min(Math.max(8, event.clientX - sort.grabOffsetX), Math.max(8, window.innerWidth - previewWidth - 8));
        const top = Math.min(Math.max(8, event.clientY - sort.grabOffsetY), Math.max(8, window.innerHeight - previewHeight - 8));
        setSortPreview({ id: sort.id, left, top, width: previewWidth });
        const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-group]");
        const targetId = targetElement?.dataset.sortGroup;
        sort.valid = Boolean(targetId);
        if (!targetId || targetId === sort.id) return;
        const targetRect = targetElement.getBoundingClientRect();
        setOrdered((current) => {
          const from = current.findIndex((group) => group.id === sort.id);
          const target = current.findIndex((group) => group.id === targetId);
          if (from < 0 || target < 0) return current;
          let insertion = target + (event.clientY > targetRect.top + targetRect.height / 2 ? 1 : 0);
          if (from < insertion) insertion -= 1;
          if (insertion === from) return current;
          captureRects();
          const next = [...current];
          const [item] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(insertion, next.length)), 0, item);
          return next;
        });
        return;
      }

      const app = appCandidate.current;
      if (!app) return;
      if (!appDrag && Math.hypot(event.clientX - app.startX, event.clientY - app.startY) <= 6) return;
      suppressAppClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-settings-drop-group]")?.dataset.settingsDropGroup;
      const source = apps.find((item) => item.id === app.appId)?.groupId;
      setAppDrag({ appId: app.appId, x: event.clientX, y: event.clientY, targetGroup: target && target !== source ? target : undefined });
    };
    const up = () => {
      const sort = sortCandidate.current;
      if (sort) {
        sortCandidate.current = null;
        setSortPreview(null);
        if (sort.active) {
          if (!sort.valid) { setOrdered(sort.original); return; }
          const finalOrder = latestOrdered.current;
          void onReorder(finalOrder.map((group) => group.id)).then((saved) => { if (!saved) setOrdered(sort.original); });
        }
      }
      const app = appDrag;
      appCandidate.current = null;
      setAppDrag(null);
      if (app?.targetGroup) void onMoveApp(app.appId, app.targetGroup);
      window.setTimeout(() => { suppressAppClick.current = false; }, 0);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelSort();
      cancelApp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", key); };
  }, [appDrag, apps, onMoveApp, onReorder]);

  const draggedApp = apps.find((app) => app.id === appDrag?.appId);
  const previewGroup = ordered.find((group) => group.id === sortPreview?.id);
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <section className="content settings-page no-drag"><div className="settings-heading"><div><h2>分组管理</h2><p>点击分组查看应用，拖动手柄调整左侧导航顺序。</p></div><div className="settings-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="launch" onClick={onCreate}>新建分组</button></div></div><div className="group-manager">{ordered.map((group) => <GroupManagerItem key={group.id} group={group} apps={apps.filter((app) => app.groupId === group.id)} expanded={expanded.has(group.id)} sorting={sortPreview?.id === group.id} appDrag={appDrag} register={(element) => { if (element) rows.current.set(group.id, element); else rows.current.delete(group.id); }} onToggle={() => toggle(group.id)} onSortStart={(event) => { if (appCandidate.current) return; event.preventDefault(); const rect = rows.current.get(group.id)?.getBoundingClientRect(); sortCandidate.current = { id: group.id, startX: event.clientX, startY: event.clientY, grabOffsetX: rect ? event.clientX - rect.left : 40, grabOffsetY: rect ? event.clientY - rect.top : 32, original: [...ordered], active: false, valid: true }; }} onEdit={() => onEdit(group)} onDelete={() => onDelete(group.id)} canDelete={groups.length > 1} onAdd={() => onAddToGroup(group.id)} onOpenApp={(app) => { if (!suppressAppClick.current) onOpenApp(app); }} onAppContextMenu={onAppContextMenu} onAppPointerDown={(event, app) => { if (event.button !== 0 || sortCandidate.current) return; appCandidate.current = { appId: app.id, startX: event.clientX, startY: event.clientY }; }} />)}</div>{sortPreview && previewGroup ? <GroupSortPreview group={previewGroup} count={apps.filter((app) => app.groupId === previewGroup.id).length} left={sortPreview.left} top={sortPreview.top} width={sortPreview.width} /> : null}{appDrag && draggedApp ? <div className="drag-preview no-drag" style={{ left: appDrag.x + 14, top: appDrag.y + 14 }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}</section>;
}

function GroupManagerItem({ group, apps, expanded, sorting, appDrag, register, onToggle, onSortStart, onEdit, onDelete, canDelete, onAdd, onOpenApp, onAppContextMenu, onAppPointerDown }: { group: AppGroup; apps: RuntimeApp[]; expanded: boolean; sorting: boolean; appDrag: { appId: string; targetGroup?: string } | null; register: (element: HTMLDivElement | null) => void; onToggle: () => void; onSortStart: (event: React.PointerEvent) => void; onEdit: () => void; onDelete: () => void; canDelete: boolean; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onAppPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  const sourceGroup = apps.some((app) => app.id === appDrag?.appId);
  return <div ref={register} data-sort-group={group.id} data-settings-drop-group={group.id} className={`group-manager-item ${expanded ? "expanded" : ""} ${sorting ? "sorting-placeholder" : ""} ${appDrag ? sourceGroup ? "app-drop-disabled" : appDrag.targetGroup === group.id ? "app-drop-active" : "app-drop-ready" : ""}`}><div className="group-manager-row"><button className="drag-handle" title="拖动排序" aria-label={`拖动 ${group.name} 排序`} onPointerDown={onSortStart}>☰</button><button className="group-manager-main" onClick={onToggle} aria-expanded={expanded}><span className="group-manager-icon"><Icon name={group.icon} /></span><span className="group-manager-name"><strong>{group.name}</strong><span>{apps.length} 个应用</span></span><span className="expand-arrow">⌄</span></button><button className="icon-action" title="编辑分组" onClick={onEdit}>✎</button><button className="icon-action danger" title="删除分组" disabled={!canDelete} onClick={onDelete}>×</button></div><div className="group-expand"><div><GroupAppGrid apps={apps} onAdd={onAdd} onOpenApp={onOpenApp} onContextMenu={onAppContextMenu} onPointerDown={onAppPointerDown} /></div></div></div>;
}

function GroupAppGrid({ apps, onAdd, onOpenApp, onContextMenu, onPointerDown }: { apps: RuntimeApp[]; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  if (!apps.length) return <div className="group-app-empty"><span>暂无应用</span><button onClick={onAdd}>添加应用</button></div>;
  return <div className="group-app-grid">{apps.map((app) => <button key={app.id} className="group-app-item" onClick={() => onOpenApp(app)} onContextMenu={(event) => onContextMenu(event, app)} onPointerDown={(event) => onPointerDown(event, app)}><span className="group-app-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <Icon name="grid" />}{app.metrics.isRunning ? <i /> : null}</span><span title={app.name}>{app.name}</span></button>)}</div>;
}

function GroupSortPreview({ group, count, left, top, width }: { group: AppGroup; count: number; left: number; top: number; width: number }) {
  return <div className="group-sort-preview no-drag" style={{ left, top, width }}><span className="group-manager-icon"><Icon name={group.icon} /></span><span><strong>{group.name}</strong><small>{count} 个应用</small></span></div>;
}

function GroupEditDialog({ state, onClose, onSave }: { state: NonNullable<GroupEditState>; onClose: () => void; onSave: (input: GroupInput & { id?: string }) => Promise<void> }) {
  const [form, setForm] = useState(state);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    setBusy(true); setMessage("");
    try { await onSave({ id: form.id, name: form.name, icon: form.icon }); }
    catch (reason) { setMessage(cleanErrorMessage(reason, "保存分组失败")); setBusy(false); }
  };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>{form.id ? "编辑分组" : "新建分组"}</h2><label>分组名称<input autoFocus maxLength={20} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="最多 20 个字符" /></label><fieldset className="icon-picker"><legend>分组图标</legend><div>{groupIcons.map((icon) => <button type="button" key={icon} className={form.icon === icon ? "selected" : ""} title={icon} onClick={() => setForm({ ...form, icon })}><Icon name={icon} /></button>)}</div></fieldset>{message ? <p className="dialog-error">{message}</p> : null}<div className="dialog-actions"><button type="button" className="ghost" onClick={onClose}>取消</button><button type="submit" className="launch" disabled={busy || !form.name.trim()}>{busy ? "保存中..." : "保存"}</button></div></form></div>;
}

function GroupDeleteDialog({ state, groups, appCount, onChangeTarget, onClose, onConfirm }: { state: NonNullable<GroupDeleteState>; groups: AppGroup[]; appCount: number; onChangeTarget: (id: string) => void; onClose: () => void; onConfirm: () => Promise<void> }) {
  const source = groups.find((group) => group.id === state.groupId);
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog edit-dialog" onPointerDown={(event) => event.stopPropagation()}><h2>删除分组</h2><p>删除“{source?.name}”前，需要将其中 {appCount} 个应用迁移到其他分组。</p><label>迁移到<select value={state.targetGroupId} onChange={(event) => onChangeTarget(event.target.value)}>{groups.filter((group) => group.id !== state.groupId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" disabled={busy || !state.targetGroupId} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>{busy ? "处理中..." : "迁移并删除"}</button></div></div></div>;
}
function SortMark({ active, direction }: { active: boolean; direction: "asc" | "desc" }) { return <span className={`sort ${active ? "active" : ""}`}>{active ? direction === "asc" ? "▲" : "▼" : "◆"}</span>; }

function Icon({ name }: { name: string }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "activity") return <svg {...common}><path d="M4 13h3l2-6 4 10 2-6h5" /><rect x="3" y="3" width="18" height="18" rx="5" /></svg>;
  if (name === "compass") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5 5-2Z" /></svg>;
  if (name === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2M3 12h18" /></svg>;
  if (name === "wrench") return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5L15 12l-3-3 2.7-2.7Z" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a8 8 0 0 0 0-6M4.6 9a8 8 0 0 0 0 6M8 4.8a8 8 0 0 1 8 0M16 19.2a8 8 0 0 1-8 0" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "play") return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
  if (name === "gamepad") return <svg {...common}><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.1 3.4a2 2 0 0 1-3.3.8L14 15h-4l-2.4 2.4a2 2 0 0 1-3.3-.8l-1.1-3.4A4 4 0 0 1 7 8Z" /><path d="M7 11v4M5 13h4M16 12h.01M18 14h.01" /></svg>;
  if (name === "folder") return <svg {...common}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></svg>;
  if (name === "music") return <svg {...common}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
  if (name === "code") return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>;
  return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
