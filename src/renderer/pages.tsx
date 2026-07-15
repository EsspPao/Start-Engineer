import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppEntry, AppFolder, AppMetrics, FolderLaunchVisualStatus, GroupGridItemId, ProcessInfo } from "../shared/types";
import { resolveAppCardActivation } from "./app-card-interaction";

type RuntimeApp = AppEntry & { metrics: AppMetrics };
type DisplayProcess = ProcessInfo & { isEnded?: boolean };
type SortKey = "name" | "cpuPercent" | "memoryBytes" | "diskBytesPerSecond";
type ProcessFilter = "all" | "managed";

const formatMemory = (bytes: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "--");
const formatDisk = (bytes: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB/s` : "0.0 MB/s");
const initials = (name: string) => [...name].filter((char) => /\p{L}|\p{N}/u.test(char)).slice(0, 2).join("").toUpperCase() || "APP";
const SortMark = ({ active, direction }: { active: boolean; direction: "asc" | "desc" }) => <span className={`sort ${active ? "active" : ""}`}>{active ? direction === "asc" ? "▲" : "▼" : "◆"}</span>;
const GridIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
const ProcessIcon = ({ process }: { process: DisplayProcess }) => {
  const generated = process.iconDataUrl?.startsWith("data:image/svg+xml");
  return <div className={`process-icon ${process.iconDataUrl ? "has-image" : "fallback"} ${generated ? "generated" : ""}`} aria-hidden="true">
    {process.iconDataUrl ? <img src={process.iconDataUrl} alt="" /> : <span className="process-icon-fallback">{initials(process.name)}</span>}
  </div>;
};

export const ProcessPage = memo(function ProcessPage({ processes, loading, lockedProcessName, sortKey, sortDirection, changeSort, filter, setFilter, onContextMenu }: { processes: DisplayProcess[]; loading?: boolean; lockedProcessName: string; sortKey: SortKey; sortDirection: "asc" | "desc"; changeSort: (key: SortKey) => void; filter: ProcessFilter; setFilter: (value: ProcessFilter) => void; onContextMenu: (event: React.MouseEvent, process: ProcessInfo) => void }) {
  const rowHeight = 58;
  const tableRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport((current) => ({ ...current, height: element.clientHeight })));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const start = Math.max(0, Math.floor(Math.max(0, viewport.top - 52) / rowHeight) - 6);
  const visible = processes.slice(start, start + Math.ceil(viewport.height / rowHeight) + 12);
  return <section className="content no-drag"><div className="table-toolbar"><div className="segmented"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>全部进程</button><button className={filter === "managed" ? "selected" : ""} onClick={() => setFilter("managed")}>已管理应用</button></div></div><div ref={tableRef} className="process-table" tabIndex={-1} onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
    <div className="process-row header"><button onClick={() => changeSort("name")}>进程 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("name")}>名称 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("cpuPercent")}>CPU <SortMark active={sortKey === "cpuPercent"} direction={sortDirection} /></button><button onClick={() => changeSort("memoryBytes")}>内存 <SortMark active={sortKey === "memoryBytes"} direction={sortDirection} /></button><button onClick={() => changeSort("diskBytesPerSecond")}>磁盘 <SortMark active={sortKey === "diskBytesPerSecond"} direction={sortDirection} /></button></div>
    {processes.length ? <div className="process-virtual-body" style={{ height: processes.length * rowHeight }}>{visible.map((process, index) => <div style={{ transform: `translateY(${(start + index) * rowHeight}px)` }} className={`process-row virtual ${process.name.toLowerCase() === lockedProcessName ? "locked" : ""} ${process.isEnded ? "ended" : ""}`} key={process.name.toLowerCase()} onContextMenu={(event) => onContextMenu(event, process)}><ProcessIcon process={process} /><div><p>{process.name}</p><span title={`PID: ${process.pids.join(", ")}`}>{process.isEnded ? "已结束" : process.processCount > 1 ? `${process.processCount} 个进程` : `PID ${process.pid}`}</span></div><span>{process.isEnded ? "--" : `${process.cpuPercent.toFixed(1)}%`}</span><span>{process.isEnded ? "--" : formatMemory(process.memoryBytes)}</span><span>{process.isEnded ? "--" : formatDisk(process.diskBytesPerSecond)}</span></div>)}</div> : loading ? <div className="search-empty process-empty"><strong>正在加载进程</strong><span>首次打开进程页时会在后台准备完整列表。</span></div> : <div className="search-empty process-empty"><strong>没有匹配的进程</strong><span>修改或清除搜索内容后再试。</span></div>}
  </div></section>;
});

export const GroupPage = memo(function GroupPage({ apps, folders = [], launchingAppIds, selectedAppId, invalidAppIds, draggingAppId, runningCount, showAppNames, onSelectApp, onFocusApp, onLaunchApp, onLaunchingFeedback, onCloseAll, onAdd, onContextMenu, onPointerDown, onRequestClose, onFolderDrop }: { apps: RuntimeApp[]; folders?: AppFolder[]; launchingAppIds: Set<string>; selectedAppId: string; invalidAppIds: Set<string>; draggingAppId?: string; runningCount: number; showAppNames: boolean; onSelectApp: (app: RuntimeApp) => void; onFocusApp: (app: RuntimeApp) => void; onLaunchApp: (app: RuntimeApp) => void; onLaunchingFeedback: (app: RuntimeApp) => void; onCloseAll: () => void; onAdd: () => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void; onRequestClose: (app: RuntimeApp) => void; onFolderDrop?: (folderId: string) => void; onLaunchFolder?: (folderId: string) => void }) {
  const runActivation = (actions: ReturnType<typeof resolveAppCardActivation>, app: RuntimeApp) => {
    for (const action of actions) {
      if (action === "select") onSelectApp(app);
      else if (action === "focus") onFocusApp(app);
      else if (action === "launch") onLaunchApp(app);
      else onLaunchingFeedback(app);
    }
  };
  const scheduleSingleClick = (clickDetail: number, app: RuntimeApp, isLaunching: boolean) => {
    if (draggingAppId) return;
    if (clickDetail !== 1) return;
    runActivation(resolveAppCardActivation({ isRunning: app.metrics.isRunning, isLaunching }, "single"), app);
  };
  const activateDoubleClick = (app: RuntimeApp, isLaunching: boolean) => {
    if (!draggingAppId) runActivation(resolveAppCardActivation({ isRunning: app.metrics.isRunning, isLaunching }, "double"), app);
  };

  return (
    <section className="content group-content no-drag">
      <div className="app-grid" tabIndex={-1}>
        {folders.map((folder) => <button key={folder.id} className="app-card folder-card" data-folder-id={folder.id} onClick={() => window.dispatchEvent(new CustomEvent("start-engineer:folder-open", { detail: folder.id }))} onPointerDown={(event) => window.dispatchEvent(new CustomEvent("start-engineer:folder-drag-start", { detail: { folderId: folder.id, x: event.clientX, y: event.clientY } }))} onPointerUp={() => onFolderDrop?.(folder.id)}><div className="folder-icon">{folder.appIds.slice(0, 4).map((id) => { const app = apps.find((item) => item.id === id); return app?.iconDataUrl ? <img key={id} src={app.iconDataUrl} alt="" /> : <GridIcon key={id} />; })}</div>{showAppNames ? <span className="app-name">{folder.name}</span> : null}</button>)}
        {apps.length ? apps.map((app) => {
          const isClosing = launchingAppIds.has(app.id) && app.metrics.isRunning;
          const isLaunching = launchingAppIds.has(app.id) && !isClosing;
          const isCurrent = app.id === selectedAppId;
          const isInvalid = invalidAppIds.has(app.id) && !app.metrics.isRunning;
          return (
            <div key={app.id} data-app-card-id={app.id} className={`app-card-wrap ${showAppNames ? "" : "names-hidden"} ${app.metrics.isRunning ? "running" : ""} ${isCurrent ? "current" : ""} ${isLaunching ? "launching" : ""} ${isClosing ? "closing-app" : ""} ${isInvalid ? "invalid" : ""} ${app.id === draggingAppId ? "drag-placeholder" : ""}`}>
              <button
                className={`app-card ${showAppNames ? "" : "names-hidden"} ${isCurrent ? "current" : ""} ${app.id === draggingAppId ? "dragging" : ""} ${isLaunching ? "launching" : ""}`}
                title={app.name}
                aria-label={app.name}
                aria-busy={isLaunching || isClosing}
                aria-pressed={isCurrent}
                onClick={(event) => scheduleSingleClick(event.detail, app, isLaunching)}
                onDoubleClick={() => activateDoubleClick(app, isLaunching)}
                onContextMenu={(event) => onContextMenu(event, app)}
                onPointerDown={(event) => onPointerDown(event, app)}
              >
                {isInvalid ? <span className="invalid-path-badge" title="程序路径可能失效" aria-label="程序路径可能失效">!</span> : null}
                <div className="card-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <GridIcon />}</div>
                {showAppNames ? <span className="app-name" title={app.name}>{app.name}</span> : null}
                {isLaunching ? <span className="launching-overlay"><i aria-hidden="true" />启动中</span> : null}
                {isClosing ? <span className="launching-overlay closing-overlay"><i aria-hidden="true" />关闭中</span> : null}
              </button>
              {app.metrics.isRunning ? (
                <button
                  type="button"
                  className="running-status-button"
                  title="关闭应用"
                  aria-label="关闭应用"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRequestClose(app); }}
                  onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onContextMenu={(event) => event.stopPropagation()}
                >
                  <span className="running-dot" aria-hidden="true" />
                  <span className="running-close-x" aria-hidden="true">×</span>
                </button>
              ) : null}
            </div>
          );
        }) : <div className="search-empty"><GridIcon /><strong>没有匹配的应用</strong><span>修改或清除搜索内容后再试。</span></div>}
      </div>
      <div className="group-actions">
        <button className="ghost group-close group-close-action" onClick={onCloseAll} disabled={!runningCount}>关闭全部{runningCount ? ` (${runningCount})` : ""}</button>
        <button className="launch group-add-action" onClick={onAdd}>添加应用</button>
      </div>
    </section>
  );
});

type UnifiedGroupPageProps = {
  apps: RuntimeApp[];
  allApps: RuntimeApp[];
  folders: AppFolder[];
  itemOrder: GroupGridItemId[];
  expandedFolderId: string;
  launchingAppIds: Set<string>;
  folderLaunchStatuses?: Record<string, FolderLaunchVisualStatus>;
  selectedItemId: GroupGridItemId | "";
  invalidAppIds: Set<string>;
  draggingItemId?: GroupGridItemId;
  runningCount: number;
  showAppNames: boolean;
  onSelectApp: (app: RuntimeApp) => void;
  onFocusApp: (app: RuntimeApp) => void;
  onLaunchApp: (app: RuntimeApp) => void;
  onLaunchingFeedback: (app: RuntimeApp) => void;
  onCloseAll: () => void;
  onAdd: () => void;
  onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void;
  onAppPointerDown: (event: React.PointerEvent, app: RuntimeApp, sourceFolderId?: string) => void;
  onFolderPointerDown: (event: React.PointerEvent, folder: AppFolder) => void;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onLaunchFolder: (folderId: string) => void;
  onRequestCloseFolder: (folderId: string) => void;
  onRequestClose: (app: RuntimeApp) => void;
};

export const UnifiedGroupPage = memo(function UnifiedGroupPage(props: UnifiedGroupPageProps) {
  const { apps, allApps, folders, itemOrder, expandedFolderId, launchingAppIds, folderLaunchStatuses = {}, selectedItemId, invalidAppIds, draggingItemId, runningCount, showAppNames } = props;
  const [folderOrigin, setFolderOrigin] = useState<DOMRect | null>(null);
  const folderClickTimer = useRef<number | null>(null);
  const [renderedFolderId, setRenderedFolderId] = useState(expandedFolderId);
  const [folderZoomPhase, setFolderZoomPhase] = useState<"opening" | "open" | "closing">(expandedFolderId ? "open" : "closing");
  useEffect(() => {
    if (expandedFolderId) {
      setRenderedFolderId(expandedFolderId);
      setFolderZoomPhase("opening");
      const frame = window.requestAnimationFrame(() => setFolderZoomPhase("open"));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!renderedFolderId) return;
    const source = document.querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(renderedFolderId)}"] .folder-card`);
    if (source) setFolderOrigin(source.getBoundingClientRect());
    setFolderZoomPhase("closing");
    const timer = window.setTimeout(() => { setRenderedFolderId(""); setFolderOrigin(null); }, 340);
    return () => window.clearTimeout(timer);
  }, [expandedFolderId]);
  useEffect(() => () => { if (folderClickTimer.current) window.clearTimeout(folderClickTimer.current); }, []);
  const gridRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const gridAnimations = useRef(new Map<string, Animation>());
  useLayoutEffect(() => {
    for (const animation of gridAnimations.current.values()) animation.cancel();
    gridAnimations.current.clear();
    const nodes = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-grid-item-id]") ?? [])];
    const nextRects = new Map(nodes.map((node) => [node.dataset.gridItemId ?? "", node.getBoundingClientRect()]));
    if (draggingItemId && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const node of nodes) {
        const id = node.dataset.gridItemId ?? "";
        if (id === draggingItemId) continue;
        const before = previousRects.current.get(id);
        const after = nextRects.get(id);
        if (!before || !after) continue;
        const x = before.left - after.left;
        const y = before.top - after.top;
        if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;
        const animation = node.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: "translate(0,0)" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
        gridAnimations.current.set(id, animation);
        animation.onfinish = () => { if (gridAnimations.current.get(id) === animation) gridAnimations.current.delete(id); };
      }
    }
    previousRects.current = nextRects;
  }, [draggingItemId, itemOrder]);
  useEffect(() => () => {
    for (const animation of gridAnimations.current.values()) animation.cancel();
    gridAnimations.current.clear();
  }, []);
  const appsById = new Map(allApps.map((app) => [app.id, app]));
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));

  const activate = (app: RuntimeApp, mode: "single" | "double") => {
    if (document.documentElement.dataset.cardDragging) return;
    const launchStatus = folderLaunchStatuses[app.id];
    const hasLaunchFeedback = launchStatus === "queued" || launchStatus === "launching" || launchStatus === "waiting";
    const isClosing = launchingAppIds.has(app.id) && app.metrics.isRunning && !hasLaunchFeedback;
    const isLaunching = !isClosing && (launchingAppIds.has(app.id) || hasLaunchFeedback);
    for (const action of resolveAppCardActivation({ isRunning: app.metrics.isRunning, isLaunching }, mode)) {
      if (action === "select") props.onSelectApp(app);
      else if (action === "focus") props.onFocusApp(app);
      else if (action === "launch") props.onLaunchApp(app);
      else props.onLaunchingFeedback(app);
    }
  };

  const appCard = (app: RuntimeApp, sourceFolderId?: string) => {
    const launchStatus = folderLaunchStatuses[app.id];
    const hasLaunchFeedback = launchStatus === "queued" || launchStatus === "launching" || launchStatus === "waiting";
    const isClosing = launchingAppIds.has(app.id) && app.metrics.isRunning && !hasLaunchFeedback;
    const isLaunching = !isClosing && (launchingAppIds.has(app.id) || hasLaunchFeedback);
    const isCurrent = selectedItemId === `app:${app.id}`;
    const isInvalid = invalidAppIds.has(app.id) && !app.metrics.isRunning;
    const itemId = `app:${app.id}` as const;
    return <div key={`${sourceFolderId ?? "outer"}-${app.id}`} data-app-card-id={app.id} data-grid-item-id={sourceFolderId ? undefined : itemId} data-folder-member-id={sourceFolderId ? app.id : undefined} className={`app-card-wrap ${showAppNames ? "" : "names-hidden"} ${app.metrics.isRunning ? "running" : ""} ${isCurrent ? "current" : ""} ${isLaunching ? "launching" : ""} ${isClosing ? "closing-app" : ""} ${isInvalid ? "invalid" : ""} ${draggingItemId === itemId ? "drag-placeholder" : ""}`}>
      <button className={`app-card ${showAppNames ? "" : "names-hidden"} ${isCurrent ? "current" : ""} ${isLaunching ? "launching" : ""} ${isClosing ? "closing-app" : ""}`} title={app.name} aria-label={app.name} aria-busy={isLaunching || isClosing} onClick={(event) => { if (event.detail === 1) activate(app, "single"); }} onDoubleClick={() => activate(app, "double")} onContextMenu={(event) => props.onContextMenu(event, app)} onPointerDown={(event) => props.onAppPointerDown(event, app, sourceFolderId)}>
        {isInvalid ? <span className="invalid-path-badge">!</span> : null}<div className="card-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <GridIcon />}</div>{showAppNames ? <span className="app-name">{app.name}</span> : null}{isLaunching ? <span className="launching-overlay"><i />启动中</span> : null}{isClosing ? <span className="launching-overlay closing-overlay"><i />关闭中</span> : null}
      </button>
      {app.metrics.isRunning ? <button type="button" className="running-status-button" aria-label="关闭应用" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onRequestClose(app); }}><span className="running-dot" /><span className="running-close-x">×</span></button> : null}
    </div>;
  };

  const fallbackItemOrder: GroupGridItemId[] = [
    ...apps.map((app) => `app:${app.id}` as const),
    ...folders.map((folder) => `folder:${folder.id}` as const)
  ];
  const renderItemOrder = itemOrder.length ? itemOrder : fallbackItemOrder;
  const renderedItems: React.ReactNode[] = [];
  for (const itemId of renderItemOrder) {
    if (itemId.startsWith("app:")) {
      const app = appsById.get(itemId.slice(4));
      if (app && apps.some((outer) => outer.id === app.id)) renderedItems.push(appCard(app));
      continue;
    }
    const folder = foldersById.get(itemId.slice(7));
    if (!folder) continue;
    const members = folder.appIds.map((id) => appsById.get(id)).filter((app): app is RuntimeApp => Boolean(app));
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, members.length))));
    const iconSize = Math.max(8, Math.min(42, Math.floor((94 - (columns - 1) * 2) / columns)));
    const folderIsLaunching = members.some((app) => folderLaunchStatuses[app.id] === "queued" || folderLaunchStatuses[app.id] === "launching" || folderLaunchStatuses[app.id] === "waiting");
    const folderIsClosing = members.some((app) => launchingAppIds.has(app.id) && app.metrics.isRunning);
    const runningMemberCount = members.filter((app) => app.metrics.isRunning).length;
    const folderHasRunningApps = runningMemberCount > 0;
    const folderIsRunning = members.length > 0 && runningMemberCount === members.length;
    const folderIsPartiallyRunning = folderHasRunningApps && !folderIsRunning;
    const runningProgress = members.length ? Math.round(runningMemberCount / members.length * 100) : 0;
    renderedItems.push(
      <div key={folder.id} data-grid-item-id={itemId} data-folder-id={folder.id} className={["app-card-wrap", "folder-card-wrap", folderIsRunning && "running", folderIsPartiallyRunning && "partial-running", selectedItemId === itemId && "current", (folderIsLaunching || folderIsClosing) && "folder-batch-active", folderIsClosing && "closing-app", draggingItemId === itemId && "drag-placeholder"].filter(Boolean).join(" ")}>
        <button className={["app-card", "folder-card", !showAppNames && "names-hidden", selectedItemId === itemId && "current", renderedFolderId === folder.id && "folder-source-hidden"].filter(Boolean).join(" ")} aria-pressed={selectedItemId === itemId} onClick={(event) => { if (event.detail !== 1 || document.documentElement.dataset.cardDragging) return; props.onSelectFolder(folder.id); const origin = event.currentTarget.getBoundingClientRect(); if (folderClickTimer.current) window.clearTimeout(folderClickTimer.current); folderClickTimer.current = window.setTimeout(() => { folderClickTimer.current = null; setFolderOrigin(origin); props.onToggleFolder(folder.id); }, 220); }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (folderClickTimer.current) { window.clearTimeout(folderClickTimer.current); folderClickTimer.current = null; } if (!document.documentElement.dataset.cardDragging) props.onLaunchFolder(folder.id); }} onPointerDown={(event) => props.onFolderPointerDown(event, folder)}>
          <div className="folder-icon" style={{ "--folder-columns": columns, "--folder-icon-size": `${iconSize}px` } as React.CSSProperties}>
            {members.map((app) => {
              const status = launchingAppIds.has(app.id) && app.metrics.isRunning ? "closing" : folderLaunchStatuses[app.id];
              return <span key={app.id} className={["folder-member-launch", status, folderIsPartiallyRunning && app.metrics.isRunning && "member-running"].filter(Boolean).join(" ")}>{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <GridIcon />}<i aria-hidden="true" /></span>;
            })}
          </div>
          {showAppNames ? <span className="app-name">{folder.name}</span> : null}
        </button>
        {folderHasRunningApps ? <button type="button" className={["running-status-button", "folder-running-status", folderIsPartiallyRunning && "partial"].filter(Boolean).join(" ")} style={{ "--folder-running-progress": `${runningProgress}%` } as React.CSSProperties} title={folderIsRunning ? "关闭卡片内全部应用" : `${runningMemberCount}/${members.length} 个应用运行中`} aria-label={folderIsRunning ? "关闭卡片内全部应用" : `${runningMemberCount}/${members.length} 个应用运行中，关闭正在运行的应用`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); props.onRequestCloseFolder(folder.id); }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onContextMenu={(event) => event.stopPropagation()}><span className="running-dot" aria-hidden="true" /><span className="running-close-x" aria-hidden="true">×</span></button> : null}
      </div>
    );
  }

  const expandedFolder = foldersById.get(renderedFolderId); const expandedMembers = expandedFolder?.appIds.map((id) => appsById.get(id)).filter((app): app is RuntimeApp => Boolean(app)) ?? []; return <section className="content group-content unified-content no-drag"><div ref={gridRef} className="app-grid unified-grid" tabIndex={-1}>{renderedItems.length ? renderedItems : <div className="search-empty"><GridIcon /><strong>没有匹配的应用</strong></div>}</div>{expandedFolder ? <div className={`folder-zoom-backdrop ${folderZoomPhase}`} onPointerDown={() => { if (folderZoomPhase !== "closing") props.onToggleFolder(expandedFolder.id); }}><div className={`folder-zoom-card ${folderZoomPhase}`} style={folderOrigin && typeof window !== "undefined" ? { "--folder-origin-x": `${folderOrigin.left + folderOrigin.width / 2}px`, "--folder-origin-y": `${folderOrigin.top + folderOrigin.height / 2}px`, "--folder-origin-scale-x": folderOrigin.width / Math.min(760, window.innerWidth - 80), "--folder-origin-scale-y": folderOrigin.height / Math.min(540, window.innerHeight - 100) } as React.CSSProperties : undefined} onPointerDown={(event) => event.stopPropagation()}>{expandedMembers.map((app) => appCard(app, expandedFolder.id))}</div></div> : null}<div className="group-actions"><button className="ghost group-close group-close-action" onClick={props.onCloseAll} disabled={!runningCount}>关闭全部{runningCount ? ` (${runningCount})` : ""}</button><button className="launch group-add-action" onClick={props.onAdd}>添加应用</button></div></section>;
});
