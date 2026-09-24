import { useEffect, useState } from "react";
import type { ConfigBackupSummary, StartEngineerApi } from "../shared/types";
import { cleanErrorMessage } from "./error-message";

export function SupportSettings({ client }: { client: StartEngineerApi }) {
  const [backups, setBackups] = useState<ConfigBackupSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { let active = true; void client.listConfigBackups().then((items) => { if (active) setBackups(items); }).catch(() => { if (active) setMessage("无法读取备份，请稍后重试"); }); return () => { active = false; }; }, [client]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(cleanErrorMessage(error, "操作未完成，请稍后重试")); }
    finally { setBusy(false); }
  };
  return <section className="settings-primary-section support-settings" aria-labelledby="support-heading">
    <header className="settings-section-heading"><span><strong id="support-heading">备份与帮助</strong><small>保留你的启动台设置，遇到问题时方便反馈。</small></span></header>
    <div className="preference-grid">
      <div className="preference-row"><span><strong>配置备份与恢复</strong><small>更新后首次启动会先备份原配置。包含应用、分组、排列、图标和外观；备份保存在本机。</small></span><div className="preference-options"><button disabled={busy} onClick={() => void run(async () => { await client.createConfigBackup(); setBackups(await client.listConfigBackups()); setMessage("当前配置已备份"); })}>立即备份</button><button disabled={busy} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>恢复备份</button></div></div>
      <div className="preference-row"><span><strong>反馈问题</strong><small>打开 GitHub 问题模板，自动附带版本和系统信息，不包含个人路径。检查后由你提交。</small></span><button className="shortcut-reset" disabled={busy} onClick={() => void run(() => client.openFeedback())}>反馈问题</button></div>
    </div>
    {message && <p className="support-message" role="status">{message}</p>}
    {expanded && <div className="backup-list">{backups.length === 0 ? <p>暂无备份，点击“立即备份”保存当前配置。</p> : backups.map((backup) => <div className="preference-row" key={backup.id}><span><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{backup.reason} · {backup.appCount} 个应用 · v{backup.version}</small></span><button className="shortcut-reset" disabled={busy} onClick={() => void run(async () => { const restored = await client.restoreConfigBackup(backup.id); if (!restored) setMessage("已取消恢复，当前配置未改变"); })}>恢复这份备份</button></div>)}</div>}
  </section>;
}
