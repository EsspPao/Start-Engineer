import React, { useState } from "react";
import type { UpdateAppInput } from "../shared/types";
import { cleanErrorMessage } from "./error-message";

export type AppEditState = { id: string; name: string; executablePath: string; launchArgs: string } | null;

export function AppEditDialog({ state, onClose, onPickExecutable, onSave }: { state: AppEditState; onClose: () => void; onPickExecutable: (id: string) => Promise<string | null>; onSave: (input: UpdateAppInput) => Promise<void> }) {
  const [form, setForm] = useState(state!);
  const [busy, setBusy] = useState(false);
  const [selectingProgram, setSelectingProgram] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  if (!form) return null;
  const chooseExecutable = async () => {
    setSelectionError("");
    setSelectingProgram(true);
    try {
      const executablePath = await onPickExecutable(form.id);
      if (executablePath) setForm((current) => current ? { ...current, executablePath } : current);
    } catch (reason) {
      setSelectionError(cleanErrorMessage(reason, "选择启动程序失败"));
    } finally {
      setSelectingProgram(false);
    }
  };
  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    await onSave({ id: form.id, name: form.name.trim(), executablePath: form.executablePath, launchArgs: form.launchArgs.trim() || undefined });
    onClose();
  };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>编辑应用信息</h2><label>名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>启动程序<span className="executable-picker"><input value={form.executablePath} readOnly title={form.executablePath} /><button type="button" className="ghost" onClick={() => void chooseExecutable()} disabled={busy || selectingProgram}>{selectingProgram ? "选择中..." : "选择程序"}</button></span></label><label>启动参数<input value={form.launchArgs} onChange={(event) => setForm({ ...form, launchArgs: event.target.value })} placeholder="例如：--silent" /></label>{selectionError ? <p className="dialog-error">{selectionError}</p> : null}<div className="dialog-actions"><button type="button" className="ghost" onClick={onClose} disabled={busy || selectingProgram}>取消</button><button type="submit" className="launch" disabled={busy || selectingProgram || !form.name.trim() || !form.executablePath}>保存</button></div></form></div>;
}
