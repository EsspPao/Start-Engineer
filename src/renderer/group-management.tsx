import React, { useEffect, useId, useRef, useState } from "react";
import type { AppGroup, GroupInput } from "../shared/types";
import { cleanErrorMessage } from "./error-message";
import { Icon } from "./ui-icons";
import type { RuntimeApp } from "./window-focus-feedback";

const groupIcons = ["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"];
export type GroupEditState = { id?: string; name: string; icon: string } | null;
export type GroupDeleteState = { groupId: string; targetGroupId: string } | null;

function GroupActionIcon({ kind }: { kind: "drag" | "expand" | "edit" | "delete" | "more" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "drag") return <svg {...common} className="action-icon drag-dots"><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" /></svg>;
  if (kind === "expand") return <svg {...common} className="action-icon expand-chevron"><path d="m8 10 4 4 4-4" /></svg>;
  if (kind === "edit") return <svg {...common} className="action-icon edit-pencil"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
  if (kind === "delete") return <svg {...common} className="action-icon delete-trash"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
  return <svg {...common} className="action-icon more-dots"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>;
}

export function GroupActionsMenu({ id, groupName, canDelete, onEdit, onDelete }: { id: string; groupName: string; canDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  return <div id={id} className="group-actions-menu" role="menu" aria-label={`${groupName}分组操作`} onKeyDown={handleKeyDown}><button type="button" className="menu-item group-actions-menu-item" role="menuitem" onClick={onEdit}><GroupActionIcon kind="edit" /><span>编辑分组</span></button><button type="button" className="menu-item group-actions-menu-item danger" role="menuitem" disabled={!canDelete} title={canDelete ? undefined : "至少保留一个分组"} onClick={onDelete}><GroupActionIcon kind="delete" /><span>删除分组{!canDelete ? <small className="group-action-disabled-reason">至少保留一个分组</small> : null}</span></button></div>;
}

export function GroupManagerItem({ group, apps, expanded, sorting, appDrag, register, onToggle, onSortStart, onEdit, onDelete, canDelete, onAdd, onOpenApp, onAppContextMenu, onAppPointerDown }: { group: AppGroup; apps: RuntimeApp[]; expanded: boolean; sorting: boolean; appDrag: { appId: string; targetGroup?: string } | null; register: (element: HTMLDivElement | null) => void; onToggle: () => void; onSortStart: (event: React.PointerEvent) => void; onEdit: () => void; onDelete: () => void; canDelete: boolean; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onAppPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  const sourceGroup = apps.some((app) => app.id === appDrag?.appId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!actionsOpen) return;
    window.requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus());
    const closeFromOutside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActionsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [actionsOpen]);

  const runAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  return <div ref={register} data-sort-group={group.id} data-settings-drop-group={group.id} className={`group-manager-item ${actionsOpen ? "actions-open" : ""} ${expanded ? "expanded" : ""} ${sorting ? "sorting-placeholder" : ""} ${appDrag ? sourceGroup ? "app-drop-disabled" : appDrag.targetGroup === group.id ? "app-drop-active" : "app-drop-ready" : ""}`}><div className="group-manager-row"><button type="button" className="drag-handle" title="拖动排序" aria-label={`拖动 ${group.name} 排序`} onPointerDown={onSortStart}><GroupActionIcon kind="drag" /></button><button type="button" className="group-manager-main" onClick={onToggle} aria-expanded={expanded}><span className="group-manager-icon"><Icon name={group.icon} /></span><span className="group-manager-name"><strong>{group.name}</strong><span>{apps.length} 个应用</span></span><span className="expand-arrow"><GroupActionIcon kind="expand" /></span></button><div ref={actionsRef} className={`group-manager-actions ${actionsOpen ? "open" : ""}`}><button ref={triggerRef} type="button" className="icon-action group-actions-trigger" title="更多操作" aria-label={`${group.name}的更多操作`} aria-haspopup="menu" aria-expanded={actionsOpen} aria-controls={actionsOpen ? menuId : undefined} onClick={() => setActionsOpen((open) => !open)}><GroupActionIcon kind="more" /></button>{actionsOpen ? <GroupActionsMenu id={menuId} groupName={group.name} canDelete={canDelete} onEdit={() => runAction(onEdit)} onDelete={() => runAction(onDelete)} /> : null}</div></div>{expanded ? <div className="group-expand"><GroupAppGrid apps={apps} onAdd={onAdd} onOpenApp={onOpenApp} onContextMenu={onAppContextMenu} onPointerDown={onAppPointerDown} /></div> : null}</div>;
}

function GroupAppGrid({ apps, onAdd, onOpenApp, onContextMenu, onPointerDown }: { apps: RuntimeApp[]; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  if (!apps.length) return <div className="group-app-empty"><span>暂无应用</span><button onClick={onAdd}>添加应用</button></div>;
  return <div className="group-app-grid">{apps.map((app) => <button key={app.id} className="group-app-item" onClick={() => onOpenApp(app)} onContextMenu={(event) => onContextMenu(event, app)} onPointerDown={(event) => onPointerDown(event, app)}><span className="group-app-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <Icon name="grid" />}{app.metrics.isRunning ? <i /> : null}</span><span title={app.name}>{app.name}</span></button>)}</div>;
}

export function GroupSortPreview({ group, count, left, top, width }: { group: AppGroup; count: number; left: number; top: number; width: number }) {
  return <div className="group-sort-preview no-drag" style={{ left, top, width }}><span className="group-manager-icon"><Icon name={group.icon} /></span><span><strong>{group.name}</strong><small>{count} 个应用</small></span></div>;
}

export function GroupEditDialog({ state, onClose, onSave }: { state: NonNullable<GroupEditState>; onClose: () => void; onSave: (input: GroupInput & { id?: string }) => Promise<void> }) {
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

export function GroupDeleteDialog({ state, groups, appCount, onChangeTarget, onClose, onConfirm }: { state: NonNullable<GroupDeleteState>; groups: AppGroup[]; appCount: number; onChangeTarget: (id: string) => void; onClose: () => void; onConfirm: () => Promise<void> }) {
  const source = groups.find((group) => group.id === state.groupId);
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog edit-dialog" onPointerDown={(event) => event.stopPropagation()}><h2>删除分组</h2><p>删除“{source?.name}”前，需要将其中 {appCount} 个应用迁移到其他分组。</p><label>迁移到<select value={state.targetGroupId} onChange={(event) => onChangeTarget(event.target.value)}>{groups.filter((group) => group.id !== state.groupId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" disabled={busy || !state.targetGroupId} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>{busy ? "处理中..." : "迁移并删除"}</button></div></div></div>;
}
