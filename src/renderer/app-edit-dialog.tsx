import React, { useState } from "react";
import type { AppWakeStrategy, UpdateAppInput } from "../shared/types";
import { cleanErrorMessage } from "./error-message";

export type AppEditState = {
  id: string;
  name: string;
  executablePath: string;
  launchArgs: string;
  appUserModelId?: string;
  wakeStrategy: AppWakeStrategy;
} | null;

const wakeStrategyHelp: Record<AppWakeStrategy, string> = {
  auto: "优先恢复已有窗口，仅对已知安全的应用使用备用唤醒方式。",
  "window-only": "只恢复已经存在的窗口；应用进入系统托盘后会安全失败。",
  "self-launch": "找不到窗口时重新运行启动程序一次。部分应用可能会打开第二实例。",
  aumid: "找不到窗口时使用稳定的 Windows 应用身份激活一次。"
};

export function AppEditDialog({ state, onClose, onPickExecutable, onSave }: {
  state: AppEditState;
  onClose: () => void;
  onPickExecutable: (id: string) => Promise<string | null>;
  onSave: (input: UpdateAppInput) => Promise<void>;
}) {
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
      if (executablePath) setForm((current) => current ? { ...current, executablePath, appUserModelId: undefined, wakeStrategy: current.wakeStrategy === "aumid" ? "auto" : current.wakeStrategy } : current);
    } catch (reason) {
      setSelectionError(cleanErrorMessage(reason, "选择启动程序失败"));
    } finally {
      setSelectingProgram(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await onSave({
        id: form.id,
        name: form.name.trim(),
        executablePath: form.executablePath,
        launchArgs: form.launchArgs.trim() || undefined,
        appUserModelId: form.appUserModelId,
        wakeStrategy: form.wakeStrategy
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop no-drag" onPointerDown={onClose}>
    <form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}>
      <h2>编辑应用信息</h2>
      <label>名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>{form.appUserModelId ? "Windows 应用标识" : "启动程序"}<span className="executable-picker"><input value={form.appUserModelId || form.executablePath} readOnly title={form.appUserModelId || form.executablePath} /><button type="button" className="ghost" onClick={() => void chooseExecutable()} disabled={busy || selectingProgram}>{selectingProgram ? "选择中..." : form.appUserModelId ? "改用本地程序" : "选择程序"}</button></span></label>
      <label>启动参数<input value={form.launchArgs} onChange={(event) => setForm({ ...form, launchArgs: event.target.value })} placeholder="例如：--silent" /></label>
      <details className="app-edit-advanced">
        <summary>高级设置</summary>
        <div className="app-edit-advanced-content">
          <label>唤醒方式
            <select value={form.wakeStrategy} onChange={(event) => setForm({ ...form, wakeStrategy: event.target.value as AppWakeStrategy })}>
              <option value="auto">自动推荐</option>
              <option value="window-only">仅查找窗口</option>
              <option value="self-launch">重新运行以唤醒</option>
              <option value="aumid" disabled={!form.appUserModelId}>使用 Windows 应用身份唤醒</option>
            </select>
          </label>
          <p className={form.wakeStrategy === "self-launch" ? "wake-strategy-help warning" : "wake-strategy-help"}>{wakeStrategyHelp[form.wakeStrategy]}</p>
        </div>
      </details>
      {selectionError ? <p className="dialog-error">{selectionError}</p> : null}
      <div className="dialog-actions"><button type="button" className="ghost" onClick={onClose} disabled={busy || selectingProgram}>取消</button><button type="submit" className="launch" disabled={busy || selectingProgram || !form.name.trim() || (!form.executablePath && !form.appUserModelId)}>保存</button></div>
    </form>
  </div>;
}
