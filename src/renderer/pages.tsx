import { memo, useEffect, useRef, useState } from "react";
import type { AppEntry, AppMetrics, ProcessInfo } from "../shared/types";
import { createCardClickGuard, shouldToggleAppSelectionFromClick } from "./card-click";

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

export const ProcessPage = memo(function ProcessPage({ processes, lockedProcessName, sortKey, sortDirection, changeSort, filter, setFilter, onContextMenu }: { processes: DisplayProcess[]; lockedProcessName: string; sortKey: SortKey; sortDirection: "asc" | "desc"; changeSort: (key: SortKey) => void; filter: ProcessFilter; setFilter: (value: ProcessFilter) => void; onContextMenu: (event: React.MouseEvent, process: ProcessInfo) => void }) {
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
  return <section className="content no-drag"><div className="table-toolbar"><div className="segmented"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>全部进程</button><button className={filter === "managed" ? "selected" : ""} onClick={() => setFilter("managed")}>已管理应用</button></div></div><div ref={tableRef} className="process-table" onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
    <div className="process-row header"><button onClick={() => changeSort("name")}>进程 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("name")}>名称 <SortMark active={sortKey === "name"} direction={sortDirection} /></button><button onClick={() => changeSort("cpuPercent")}>CPU <SortMark active={sortKey === "cpuPercent"} direction={sortDirection} /></button><button onClick={() => changeSort("memoryBytes")}>内存 <SortMark active={sortKey === "memoryBytes"} direction={sortDirection} /></button><button onClick={() => changeSort("diskBytesPerSecond")}>磁盘 <SortMark active={sortKey === "diskBytesPerSecond"} direction={sortDirection} /></button></div>
    {processes.length ? <div className="process-virtual-body" style={{ height: processes.length * rowHeight }}>{visible.map((process, index) => <div style={{ transform: `translateY(${(start + index) * rowHeight}px)` }} className={`process-row virtual ${process.name.toLowerCase() === lockedProcessName ? "locked" : ""} ${process.isEnded ? "ended" : ""}`} key={process.name.toLowerCase()} onContextMenu={(event) => onContextMenu(event, process)}><div className="process-icon">{process.iconDataUrl ? <img src={process.iconDataUrl} alt="" /> : initials(process.name)}</div><div><p>{process.name}</p><span title={`PID: ${process.pids.join(", ")}`}>{process.isEnded ? "已结束" : process.processCount > 1 ? `${process.processCount} 个进程` : `PID ${process.pid}`}</span></div><span>{process.isEnded ? "--" : `${process.cpuPercent.toFixed(1)}%`}</span><span>{process.isEnded ? "--" : formatMemory(process.memoryBytes)}</span><span>{process.isEnded ? "--" : formatDisk(process.diskBytesPerSecond)}</span></div>)}</div> : <div className="search-empty process-empty"><strong>没有匹配的进程</strong><span>修改或清除搜索内容后再试。</span></div>}
  </div></section>;
});

export const GroupPage = memo(function GroupPage({ apps, launchingAppIds, draggingAppId, selectedCount, runningCount, onToggleSelected, onDoubleLaunch, onLaunchSelected, onCloseAll, onAdd, onContextMenu, onPointerDown, onRequestClose }: { apps: RuntimeApp[]; launchingAppIds: Set<string>; draggingAppId?: string; selectedCount: number; runningCount: number; onToggleSelected: (app: RuntimeApp) => void; onDoubleLaunch: (app: RuntimeApp) => void; onLaunchSelected: () => void; onCloseAll: () => void; onAdd: () => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void; onRequestClose: (app: RuntimeApp) => void }) {
  const clickTimers = useRef(new Map<string, number>());
  const clickGuard = useRef(createCardClickGuard());
  const scheduleToggle = (clickDetail: number, app: RuntimeApp) => {
    if (draggingAppId) return;
    const currentTimer = clickTimers.current.get(app.id);
    if (currentTimer !== undefined) window.clearTimeout(currentTimer);
    clickTimers.current.delete(app.id);
    if (!shouldToggleAppSelectionFromClick(clickDetail)) return;
    const now = window.performance.now();
    clickGuard.current.markClick(app.id, now);
    const timer = window.setTimeout(() => {
      clickTimers.current.delete(app.id);
      if (clickGuard.current.shouldCommitSingleClick(app.id, now)) onToggleSelected(app);
    }, 450);
    clickTimers.current.set(app.id, timer);
  };
  const launchDirectly = (app: RuntimeApp) => {
    if (launchingAppIds.has(app.id)) return;
    const currentTimer = clickTimers.current.get(app.id);
    if (currentTimer !== undefined) window.clearTimeout(currentTimer);
    clickTimers.current.delete(app.id);
    clickGuard.current.markDoubleClick(app.id, window.performance.now());
    if (!draggingAppId) onDoubleLaunch(app);
  };
  useEffect(() => () => { for (const timer of clickTimers.current.values()) window.clearTimeout(timer); }, []);

  return <section className="content group-content no-drag"><div className="app-grid">{apps.length ? apps.map((app) => { const isLaunching = launchingAppIds.has(app.id); return <div key={app.id} data-app-card-id={app.id} className={`app-card-wrap ${app.metrics.isRunning ? "running" : ""} ${app.launchSelected ? "selected" : ""} ${isLaunching ? "launching" : ""} ${app.id === draggingAppId ? "drag-placeholder" : ""}`}><button className={`app-card ${app.launchSelected ? "selected" : ""} ${app.id === draggingAppId ? "dragging" : ""} ${isLaunching ? "launching" : ""}`} aria-busy={isLaunching} onClick={(event) => scheduleToggle(event.detail, app)} onDoubleClick={() => launchDirectly(app)} onContextMenu={(event) => onContextMenu(event, app)} onPointerDown={(event) => onPointerDown(event, app)}><span className="app-check" aria-hidden="true">{app.launchSelected ? "✓" : ""}</span>{app.metrics.isRunning ? <span className="running-dot" title="运行中" aria-label="运行中" /> : null}<div className="card-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <GridIcon />}</div><span className="app-name" title={app.name}>{app.name}</span>{isLaunching ? <span className="launching-overlay"><i aria-hidden="true" />启动中</span> : null}</button>{app.metrics.isRunning ? <button className="app-icon-close" title={`结束 ${app.name}`} aria-label={`结束 ${app.name}`} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRequestClose(app); }}>×</button> : null}</div>; }) : <div className="search-empty"><GridIcon /><strong>没有匹配的应用</strong><span>修改或清除搜索内容后再试。</span></div>}</div><div className="group-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="ghost group-close" onClick={onCloseAll} disabled={!runningCount}>关闭全部{runningCount ? ` (${runningCount})` : ""}</button><button className="launch" onClick={onLaunchSelected} disabled={!selectedCount}><PlayIcon />一键启动{selectedCount ? ` (${selectedCount})` : ""}</button></div></section>;
});
