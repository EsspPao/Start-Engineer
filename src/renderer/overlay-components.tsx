import React, { useState } from "react";

export type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> } | null;

export function ToastStack({ notice, error, onDismissNotice, onDismissError }: { notice: string; error: string; onDismissNotice: () => void; onDismissError: () => void }) {
  const stop = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <div className="toast-stack no-drag" onPointerDown={stop} onClick={stop}>
    {notice ? <div className="toast info" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={onDismissNotice}>×</button></div> : null}
    {error ? <div className="toast" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={onDismissError}>×</button></div> : null}
  </div>;
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
