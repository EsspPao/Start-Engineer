import React, { useState } from "react";
import type { DiscoveredAppCandidate } from "../shared/types";

export type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> } | null;

export function ToastStack({ notice, error, onDismissNotice, onDismissError }: { notice: string; error: string; onDismissNotice: () => void; onDismissError: () => void }) {
  const stop = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <div className="toast-stack no-drag" onPointerDown={stop} onClick={stop}>
    {notice ? <div className="toast info" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={onDismissNotice}>×</button></div> : null}
    {error ? <div className="toast" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={onDismissError}>×</button></div> : null}
  </div>;
}

export function FirstRunImportDialog({ candidates, selectedIds, busy, onToggle, onSkip, onImport }: { candidates: DiscoveredAppCandidate[]; selectedIds: Set<string>; busy: boolean; onToggle: (id: string) => void; onSkip: () => void; onImport: () => void }) {
  const sourceLabel = (source: DiscoveredAppCandidate["source"]) => source === "windows-store" ? "Microsoft Store" : source === "desktop" ? "桌面" : source === "everything" ? "本机结果" : "开始菜单";
  return <div className="modal-backdrop no-drag"><section className="dialog import-dialog" onPointerDown={(event) => event.stopPropagation()}><div className="import-heading"><span className="import-spark">✦</span><div><h2>发现可导入应用</h2><p>选择要加入 Start Engineer 的应用。</p></div></div><div className="import-list">{candidates.map((candidate) => <button key={candidate.id} className={`import-row ${selectedIds.has(candidate.id) ? "selected" : ""}`} onClick={() => onToggle(candidate.id)}><span className="import-check">{selectedIds.has(candidate.id) ? "✓" : ""}</span><span><strong>{candidate.name}</strong><small>{candidate.category} · {sourceLabel(candidate.source)}</small></span></button>)}</div><div className="dialog-actions"><button className="ghost" disabled={busy} onClick={onSkip}>跳过</button><button className="launch" disabled={busy || selectedIds.size === 0} onClick={onImport}>{busy ? "导入中..." : `导入 ${selectedIds.size} 个`}</button></div></section></div>;
}

export function ConfirmDialog({ state, onClose, onError }: { state: NonNullable<ConfirmState>; onClose: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await state.onConfirm(); onClose(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "操作失败"); setBusy(false); }
  };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog" onPointerDown={(event) => event.stopPropagation()}><h2>{state.title}</h2><p>{state.message}</p><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" onClick={() => void confirm()} disabled={busy}>{busy ? "处理中..." : state.confirmLabel}</button></div></div></div>;
}
