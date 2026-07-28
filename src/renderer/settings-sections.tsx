import React, { useEffect, useState } from "react";
import type { AppInfo, SearchDependencyStatus } from "../shared/types";
import { formatAppDiagnostics } from "./app-info";
import { cleanErrorMessage } from "./error-message";

function api() {
  const resolved = window.startEngineer ?? window.commandDeck;
  if (!resolved) throw new Error("Start Engineer API is unavailable");
  return resolved;
}

function ExpandIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="action-icon expand-chevron"><path d="m8 10 4 4 4-4" /></svg>;
}

export function SettingsCollapsibleSection({ title, description, expanded, onToggle, children }: { title: string; description: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <><section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={onToggle}><span><strong>{title}</strong><small>{description}</small></span><ExpandIcon /></button>{expanded ? <div className="settings-collapse-content">{children}</div> : null}</section>{title === "界面主题" ? <><SearchDependencySettingsSection /><AboutSettingsSection /></> : null}</>;
}

function AboutSettingsSection() {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api().getAppInfo().then((next) => {
      if (!cancelled) setInfo(next);
    }).catch((reason) => {
      if (!cancelled) setMessage(cleanErrorMessage(reason, "读取版本信息失败"));
    });
    return () => { cancelled = true; };
  }, []);

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

  return <section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><strong>关于与诊断</strong><small>{info ? `Start Engineer ${info.version} · Windows ${info.arch}` : "版本、数据目录和故障反馈信息。"}</small></span><ExpandIcon /></button>{expanded ? <div className="settings-collapse-content"><div className="about-panel"><div className="about-summary"><strong>Start Engineer {info?.version ?? ""}</strong><small>Windows 应用启动器与进程监控工具</small>{info ? <code>Electron {info.electronVersion} · Windows {info.systemVersion} · {info.arch}</code> : <small>正在读取运行环境…</small>}{message ? <em>{message}</em> : null}</div><div className="about-actions"><button className="launch" onClick={() => run(() => api().openProjectHomepage(), "打开项目主页失败")}>项目主页</button><button className="ghost" onClick={() => run(() => api().openUserDataDirectory(), "打开数据目录失败")}>打开数据目录</button><button className="shortcut-reset" onClick={() => void copyDiagnostics()}>复制诊断信息</button></div></div></div> : null}</section>;
}

function SearchDependencySettingsSection() {
  const [expanded, setExpanded] = useState(false);
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
  const pickCli = () => void api().pickEverythingCli().then(() => refresh()).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "选择 ES.exe 失败") }));
  const openFolder = () => void api().openSearchDependencyFolder().catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "打开依赖目录失败") }));
  return <section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><strong>搜索依赖</strong><small>一键准备 Everything 便携版与 ES 命令行工具。</small></span><ExpandIcon /></button>{expanded ? <div className="settings-collapse-content"><SearchDependencyPanel status={status} onPrepare={prepare} onRefresh={refresh} onOpenFolder={openFolder} onPickCli={pickCli} /></div> : null}</section>;
}

export function SearchDependencyPanel({ status, onPrepare, onRefresh, onOpenFolder, onPickCli }: { status: SearchDependencyStatus; onPrepare: () => void; onRefresh: () => void; onOpenFolder: () => void; onPickCli: () => void }) {
  const busy = status.state === "downloading" || status.state === "extracting" || status.state === "starting";
  const statusLabel: Record<SearchDependencyStatus["state"], string> = {
    ready: "已就绪",
    missing: "未下载",
    downloading: "下载中",
    extracting: "解压中",
    starting: "启动 Everything 中",
    failed: "失败"
  };
  const progress = status.totalBytes && status.downloadedBytes ? ` ${Math.round(status.downloadedBytes / status.totalBytes * 100)}%` : "";
  return <div className="search-dependency-panel"><div className={`dependency-status ${status.state}`}><strong>{statusLabel[status.state]}{progress}</strong><small>{status.message ?? (status.state === "ready" ? "Everything 搜索依赖已经可以使用。" : "点击一键准备后会下载官方便携版到 Start Engineer 数据目录。")}</small>{status.everythingCliPath ? <code>{status.everythingCliPath}</code> : null}</div><div className="dependency-actions"><button className="launch" disabled={busy || status.state === "ready"} onClick={onPrepare}>{status.state === "failed" ? "重试准备" : "一键准备"}</button><button className="ghost" disabled={busy} onClick={onRefresh}>刷新状态</button><button className="ghost" onClick={onOpenFolder}>打开依赖目录</button><button className="shortcut-reset" disabled={busy} onClick={onPickCli}>选择 ES.exe</button></div></div>;
}
