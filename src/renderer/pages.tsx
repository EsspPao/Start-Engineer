import { memo, useEffect, useRef, useState } from "react";
import type { AppEntry, AppMetrics, ProcessInfo } from "../shared/types";
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
const PlayIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m8 5 11 7-11 7V5Z" /></svg>;

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
    {processes.length ? <div className="process-virtual-body" style={{ height: processes.length * rowHeight }}>{visible.map((process, index) => <div style={{ transform: `translateY(${(start + index) * rowHeight}px)` }} className={`process-row virtual ${process.name.toLowerCase() === lockedProcessName ? "locked" : ""} ${process.isEnded ? "ended" : ""}`} key={process.name.toLowerCase()} onContextMenu={(event) => onContextMenu(event, process)}><div className="process-icon">{process.iconDataUrl ? <img src={process.iconDataUrl} alt="" /> : initials(process.name)}</div><div><p>{process.name}</p><span title={`PID: ${process.pids.join(", ")}`}>{process.isEnded ? "已结束" : process.processCount > 1 ? `${process.processCount} 个进程` : `PID ${process.pid}`}</span></div><span>{process.isEnded ? "--" : `${process.cpuPercent.toFixed(1)}%`}</span><span>{process.isEnded ? "--" : formatMemory(process.memoryBytes)}</span><span>{process.isEnded ? "--" : formatDisk(process.diskBytesPerSecond)}</span></div>)}</div> : loading ? <div className="search-empty process-empty"><strong>正在加载进程</strong><span>首次打开进程页时会在后台准备完整列表。</span></div> : <div className="search-empty process-empty"><strong>没有匹配的进程</strong><span>修改或清除搜索内容后再试。</span></div>}
  </div></section>;
});

export const GroupPage = memo(function GroupPage({ apps, launchingAppIds, selectedAppId, invalidAppIds, draggingAppId, selectedCount, runningCount, showAppNames, onSelectApp, onFocusApp, onLaunchApp, onLaunchingFeedback, onToggleLaunchSelected, onLaunchSelected, onCloseAll, onAdd, onContextMenu, onPointerDown, onRequestClose }: { apps: RuntimeApp[]; launchingAppIds: Set<string>; selectedAppId: string; invalidAppIds: Set<string>; draggingAppId?: string; selectedCount: number; runningCount: number; showAppNames: boolean; onSelectApp: (app: RuntimeApp) => void; onFocusApp: (app: RuntimeApp) => void; onLaunchApp: (app: RuntimeApp) => void; onLaunchingFeedback: (app: RuntimeApp) => void; onToggleLaunchSelected: (app: RuntimeApp) => void; onLaunchSelected: () => void; onCloseAll: () => void; onAdd: () => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void; onRequestClose: (app: RuntimeApp) => void }) {
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
        {apps.length ? apps.map((app) => {
          const isLaunching = launchingAppIds.has(app.id);
          const isCurrent = app.id === selectedAppId;
          const isInvalid = invalidAppIds.has(app.id) && !app.metrics.isRunning;
          return (
            <div key={app.id} data-app-card-id={app.id} className={`app-card-wrap ${showAppNames ? "" : "names-hidden"} ${app.metrics.isRunning ? "running" : ""} ${app.launchSelected ? "launch-selected" : ""} ${isCurrent ? "current" : ""} ${isLaunching ? "launching" : ""} ${isInvalid ? "invalid" : ""} ${app.id === draggingAppId ? "drag-placeholder" : ""}`}>
              <button
                className={`app-card ${showAppNames ? "" : "names-hidden"} ${app.launchSelected ? "launch-selected" : ""} ${isCurrent ? "current" : ""} ${app.id === draggingAppId ? "dragging" : ""} ${isLaunching ? "launching" : ""}`}
                title={app.name}
                aria-label={app.name}
                aria-busy={isLaunching}
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
              </button>
              <button
                type="button"
                className="app-check"
                title={app.launchSelected ? "取消一键启动勾选" : "勾选为一键启动"}
                aria-label={app.launchSelected ? "取消一键启动勾选" : "勾选为一键启动"}
                aria-pressed={Boolean(app.launchSelected)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleLaunchSelected(app); }}
                onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
              >
                {app.launchSelected ? "✓" : ""}
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
        <button className="ghost" onClick={onAdd}>添加应用</button>
        <button className="ghost group-close" onClick={onCloseAll} disabled={!runningCount}>关闭全部{runningCount ? ` (${runningCount})` : ""}</button>
        <button className="launch" onClick={onLaunchSelected} disabled={!selectedCount}><PlayIcon />一键启动{selectedCount ? ` (${selectedCount})` : ""}</button>
      </div>
    </section>
  );
});
