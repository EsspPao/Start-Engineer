import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppGroup, AppWindowInfo, ProcessInfo } from "../shared/types";
import { cleanErrorMessage } from "./error-message";
import type { ConfirmState } from "./overlay-components";
import { focusHintsForApp, focusResultMessage, type RuntimeApp } from "./window-focus-feedback";

export type DisplayProcess = ProcessInfo & { isEnded?: boolean };
export type MenuState =
  | { kind: "process"; x: number; y: number; process: ProcessInfo }
  | { kind: "app"; x: number; y: number; appId: string }
  | { kind: "group"; x: number; y: number; groupId: string }
  | null;

function api() {
  const resolved = window.startEngineer ?? window.commandDeck;
  if (!resolved) throw new Error("Start Engineer API is unavailable");
  return resolved;
}

export function ProcessContextMenu({ state, process, onClose, onConfirm, onError }: { state: Extract<MenuState, { kind: "process" }>; process: DisplayProcess; onClose: () => void; onConfirm: (value: ConfirmState) => void; onError: (message: string) => void }) {
  const copy = async (value: string) => { try { await api().writeClipboardText(value); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "复制失败"); } };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{process.name}</strong><span>{process.isEnded ? "进程已结束" : `${process.processCount} 个进程`}</span></div><MenuDivider /><MenuButton disabled={!process.canTerminate || process.isEnded} title={process.terminationBlockedReason} danger onClick={() => { onClose(); onConfirm({ title: "结束进程组", message: `确定结束 ${process.name} 的 ${process.pids.length} 个进程吗？`, confirmLabel: "结束进程组", onConfirm: () => api().killProcessGroup({ name: process.name, pids: process.pids }) }); }}>结束进程组</MenuButton><MenuButton disabled={!process.exePath} onClick={() => { onClose(); if (process.exePath) void api().showItemInFolder(process.exePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => void copy(process.name)}>复制进程名称</MenuButton><MenuButton disabled={!process.exePath} onClick={() => process.exePath && void copy(process.exePath)}>复制文件路径</MenuButton><MenuButton disabled={process.isEnded} onClick={() => void copy(process.pids.join(", "))}>复制 PID</MenuButton></ContextMenu>;
}

export function AppContextMenu({ state, app, groups, onClose, onLaunch, onKill, onEdit, onMove, onRemove, onNotice, onError }: { state: Extract<MenuState, { kind: "app" }>; app?: RuntimeApp; groups: AppGroup[]; onClose: () => void; onLaunch: (id: string) => void; onKill: (app: RuntimeApp) => void; onEdit: (app: RuntimeApp) => void; onMove: (id: string, groupId: string) => Promise<void>; onRemove: (app: RuntimeApp) => void; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [windows, setWindows] = useState<AppWindowInfo[] | null>(null);
  const dependencyKey = app ? [app.id, app.metrics.isRunning, app.metrics.pids.join(","), app.metrics.matchedPids.join(","), app.metrics.associatedPids.join(","), app.metrics.matchedProcessNames.join(","), app.metrics.matchedPaths.join(",")].join("|") : "";
  useEffect(() => {
    let cancelled = false;
    setWindows(null);
    if (!app?.metrics.isRunning) return;
    void api().listAppWindows(app.id, focusHintsForApp(app)).then((items) => { if (!cancelled) setWindows(items); }).catch(() => { if (!cancelled) setWindows([]); });
    return () => { cancelled = true; };
  }, [dependencyKey]);
  if (!app) return null;
  const invoke = (action: () => void) => { onClose(); action(); };
  const focusWindow = async (handle: number) => {
    try {
      const message = focusResultMessage(await api().focusAppWindowHandle(app.id, handle, focusHintsForApp(app)));
      if (message) onNotice(message);
    } catch (reason) { onError(cleanErrorMessage(reason, "唤起应用窗口失败")); }
  };
  const copyDiagnostics = async () => {
    try {
      await api().writeClipboardText(await api().getAppWindowDiagnostics(app.id, focusHintsForApp(app)));
      onNotice("已复制窗口诊断信息");
    } catch (reason) { onError(cleanErrorMessage(reason, "复制窗口诊断信息失败")); }
  };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}>
    <MenuButton onClick={() => invoke(() => onLaunch(app.id))}>启动</MenuButton>
    {app.metrics.isRunning ? <><MenuDivider /><div className="menu-label">窗口列表</div>{windows === null ? <div className="menu-label muted">正在读取窗口…</div> : windows.length ? windows.slice(0, 8).map((item) => <MenuButton key={`${item.handle}-${item.pid}`} onClick={() => { onClose(); void focusWindow(item.handle); }}>{item.title || `窗口 ${item.pid}`}{item.minimized ? "（最小化）" : ""}</MenuButton>) : <div className="menu-label muted">未找到窗口</div>}<MenuButton onClick={() => { onClose(); void copyDiagnostics(); }}>复制窗口诊断信息</MenuButton></> : null}
    <MenuButton disabled={!app.metrics.isRunning} danger onClick={() => invoke(() => onKill(app))}>结束进程</MenuButton>
    <MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().showItemInFolder(app.executablePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton>
    <MenuDivider /><MenuButton onClick={() => invoke(() => onEdit(app))}>编辑应用信息</MenuButton><div className="menu-label">移动到分组</div>
    {groups.map((group) => <MenuButton key={group.id} disabled={app.groupId === group.id} onClick={() => { onClose(); void onMove(app.id, group.id); }}>{group.name}{app.groupId === group.id ? "（当前）" : ""}</MenuButton>)}
    <MenuDivider /><MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().writeClipboardText(app.executablePath).catch((reason) => onError(reason.message)); }}>复制程序路径</MenuButton><MenuButton danger onClick={() => invoke(() => onRemove(app))}>移除应用</MenuButton>
  </ContextMenu>;
}

export function GroupContextMenu({ state, groups, onClose, onCreate, onEdit, onDelete, onReorder }: { state: Extract<MenuState, { kind: "group" }>; groups: AppGroup[]; onClose: () => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<unknown> }) {
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

const CONTEXT_MENU_MARGIN = 8;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function resolveContextMenuPosition({ x, y, menuWidth, menuHeight, viewportWidth, viewportHeight, margin = CONTEXT_MENU_MARGIN }: { x: number; y: number; menuWidth: number; menuHeight: number; viewportWidth: number; viewportHeight: number; margin?: number }) {
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
  return {
    left: Math.min(Math.max(margin, x), maxLeft),
    top: Math.min(Math.max(margin, y), maxTop),
  };
}

function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: Math.max(CONTEXT_MENU_MARGIN, x), top: Math.max(CONTEXT_MENU_MARGIN, y) });

  useClientLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const updatePosition = () => {
      const bounds = menu.getBoundingClientRect();
      const next = resolveContextMenuPosition({ x, y, menuWidth: bounds.width, menuHeight: bounds.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
      setPosition((current) => current.left === next.left && current.top === next.top ? current : next);
    };
    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(menu);
    window.addEventListener("resize", updatePosition);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [x, y]);

  return <div ref={menuRef} className="context-menu no-drag" style={position} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>{children}<button className="menu-dismiss" aria-label="关闭菜单" onClick={onClose} /></div>;
}

function MenuButton({ disabled, danger, title, onClick, children }: { disabled?: boolean; danger?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) {
  return <button className={`menu-item ${danger ? "danger" : ""}`} disabled={disabled} title={title} onClick={onClick}>{children}</button>;
}

function MenuDivider() { return <div className="menu-divider" />; }
