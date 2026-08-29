import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppInfo, AppPreferencesState, SearchDependencyStatus } from "../shared/types";
import { formatAppDiagnostics } from "./app-info";
import { cleanErrorMessage } from "./error-message";

function api() {
  const resolved = window.startEngineer ?? window.commandDeck;
  if (!resolved) throw new Error("Start Engineer API is unavailable");
  return resolved;
}

function ExpandIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="action-icon expand-chevron" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>;
}

export function SettingsCollapsibleSection({ title, description, expanded, onToggle, children, className = "" }: { title: string; description: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; className?: string }) {
  return <section className={`settings-collapsible ${className} ${expanded ? "expanded" : ""}`.trim()}><button type="button" className="settings-collapse-toggle" aria-expanded={expanded} onClick={onToggle}><span><strong>{title}</strong><small>{description}</small></span><ExpandIcon /></button>{expanded ? <div className="settings-collapse-content">{children}</div> : null}</section>;
}

export function AboutSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api().getAppInfo().then((next) => {
      if (!cancelled) setInfo(next);
    }).catch((reason) => {
      if (!cancelled) setMessage(cleanErrorMessage(reason, "读取版本信息失败"));
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const copyDiagnostics = async () => {
    try {
      const current = info ?? await api().getAppInfo();
      setInfo(current);
      await api().writeClipboardText(formatAppDiagnostics(current));
      setMessage("诊断信息已复制，不包含应用列表或本地配置内容");
    } catch (reason) {
      setMessage(cleanErrorMessage(reason, "复制诊断信息失败"));
    }
  };

  const run = (action: () => Promise<void>, fallback: string) => {
    setMessage("");
    void action().catch((reason) => setMessage(cleanErrorMessage(reason, fallback)));
  };

  const dialog = <div className="settings-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="settings-dialog-header"><div><h2 id={titleId}>关于 Start Engineer</h2><p>版本信息与故障排查</p></div><button ref={closeButtonRef} type="button" className="settings-dialog-close" aria-label="关闭关于与诊断" onClick={onClose}>×</button></header>
      <div className="settings-dialog-content about-panel"><div className="about-summary"><strong>Start Engineer {info?.version ?? ""}</strong><small>Windows 应用启动器与桌面启动台</small>{info ? <code>Electron {info.electronVersion} · Windows {info.systemVersion} · {info.arch}</code> : <small>正在读取运行环境…</small>}{message ? <em aria-live="polite">{message}</em> : null}</div><div className="about-actions"><button className="launch" onClick={() => run(() => api().openProjectHomepage(), "打开项目主页失败")}>项目主页</button><button className="ghost" onClick={() => run(() => api().openUserDataDirectory(), "打开数据目录失败")}>打开数据目录</button><button className="shortcut-reset" onClick={() => void copyDiagnostics()}>复制诊断信息</button></div></div>
    </section>
  </div>;
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export function SearchDependencySettings({ onPreferencesResolved }: { onPreferencesResolved?: (preferences: AppPreferencesState) => void }) {
  const [status, setStatus] = useState<SearchDependencyStatus>({ state: "missing" });
  useEffect(() => {
    let cancelled = false;
    void api().getSearchDependencyStatus().then((next) => {
      if (!cancelled) setStatus(next);
    }).catch((reason) => {
      if (!cancelled) setStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") });
    });
    return () => { cancelled = true; };
  }, []);
  const prepare = () => {
    setStatus({ state: "downloading", message: "正在准备 Everything 搜索依赖" });
    void api().prepareSearchDependencies().then(setStatus).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "准备 Everything 搜索依赖失败") }));
  };
  const refresh = () => void api().getSearchDependencyStatus().then(setStatus).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") }));
  const pickCli = () => void api().pickEverythingCli().then((next) => { onPreferencesResolved?.(next); refresh(); }).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "选择 ES.exe 失败") }));
  const openFolder = () => void api().openSearchDependencyFolder().catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "打开依赖目录失败") }));
  return <div className="search-dependency-settings"><div className="settings-section-heading"><span><strong>Everything 搜索依赖</strong><small>默认自动管理；仅在搜索失败时需要手动处理。</small></span>{status.state === "failed" ? <em className="dependency-context-message" role="status">搜索依赖需要修复</em> : null}</div><SearchDependencyPanel status={status} onPrepare={prepare} onRefresh={refresh} onOpenFolder={openFolder} onPickCli={pickCli} /></div>;
}

export function SearchDependencyPanel({ status, onPrepare, onRefresh, onOpenFolder, onPickCli }: { status: SearchDependencyStatus; onPrepare: () => void; onRefresh: () => void; onOpenFolder: () => void; onPickCli: () => void }) {
  const busy = status.state === "downloading" || status.state === "extracting" || status.state === "starting";
  const statusLabel: Record<SearchDependencyStatus["state"], string> = {
    ready: "已就绪",
    missing: "未下载",
    downloading: "下载中",
    extracting: "解压中",
    starting: "启动 Everything 中",
    failed: "失败",
  };
  const progress = status.totalBytes && status.downloadedBytes ? ` ${Math.round(status.downloadedBytes / status.totalBytes * 100)}%` : "";
  return <div className="search-dependency-panel"><div className={`dependency-status ${status.state}`}><strong>{statusLabel[status.state]}{progress}</strong><small>{status.message ?? (status.state === "ready" ? "Everything 搜索依赖已经可以使用。" : "需要时可一键下载官方便携版到 Start Engineer 数据目录。")}</small>{status.everythingCliPath ? <code>{status.everythingCliPath}</code> : null}</div><div className="dependency-actions"><button className="launch" disabled={busy || status.state === "ready"} onClick={onPrepare}>{status.state === "failed" ? "一键修复" : "一键准备"}</button><button className="ghost" disabled={busy} onClick={onRefresh}>刷新状态</button><button className="ghost" onClick={onOpenFolder}>打开依赖目录</button><button className="shortcut-reset" disabled={busy} onClick={onPickCli}>选择 ES.exe</button></div></div>;
}
