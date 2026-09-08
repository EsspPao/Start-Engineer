import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { decodeAppearanceShareCode, encodeAppearanceShareCode, normalizeAppearance, type AppearancePreferences } from "../shared/appearance-share";
import { defaultUiLayoutPreferences } from "../shared/ui-layout-share";
import type { AppPreferencesState, StartEngineerApi, UiLayoutPreferences, UpdatePreferencesInput } from "../shared/types";
import { AppearancePreview } from "./appearance-preview";
import { themeOptions } from "./theme-options";
import { cleanErrorMessage } from "./error-message";
import type { RuntimeApp } from "./window-focus-feedback";
import "./appearance-editor.css";

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <fieldset className="studio-field"><legend>{label}</legend><div className="studio-choices">{options.map(([id, name]) => <button type="button" key={id} aria-pressed={id === value} onClick={() => onChange(id)}>{name}</button>)}</div></fieldset>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="studio-field"><span>{label}</span>{children}</label>;
}

export function AppearanceEditor({ preferences, apps, client, onSave, onClose }: {
  preferences: AppPreferencesState; apps: RuntimeApp[]; client: StartEngineerApi;
  onSave: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>; onClose: () => void;
}) {
  const initial = useRef(normalizeAppearance(preferences)).current;
  const [history, setHistory] = useState({ entries: [initial], index: 0 });
  const draft = history.entries[history.index];
  const [tab, setTab] = useState<"theme" | "layout" | "share">("theme");
  const [compact, setCompact] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previousFocus?.focus();
  }, []);
  const change = (appearance: AppearancePreferences) => {
    const next = normalizeAppearance(appearance);
    setHistory((current) => {
      if (JSON.stringify(next) === JSON.stringify(current.entries[current.index])) return current;
      const entries = [...current.entries.slice(0, current.index + 1), next].slice(-80);
      return { entries, index: entries.length - 1 };
    });
    setMessage("");
  };
  const layout = (input: Partial<UiLayoutPreferences>) => change({ ...draft, uiLayout: { ...draft.uiLayout, ...input } });
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...draft, showAppNames: draft.uiLayout.showAppNames });
      onClose();
    } catch (reason) {
      setMessage(cleanErrorMessage(reason, "保存失败，请重试。你的调整仍保留在此处。"));
    } finally { setSaving(false); }
  };
  const copy = async () => {
    const code = encodeAppearanceShareCode(draft);
    setShareCode(code);
    try { await client.writeClipboardText(code); setMessage("分享码已复制，发送给朋友即可导入整套外观。"); }
    catch { setMessage("无法访问剪贴板，请选中下方分享码手动复制。"); }
  };
  const importCode = () => {
    const result = decodeAppearanceShareCode(shareCode, draft);
    if (!result.ok) { setMessage(result.message); return; }
    change(result.appearance);
    setMessage(result.legacy ? "旧版布局已载入预览，保留当前主题。点击保存并应用后生效。" : "整套外观已载入预览，点击保存并应用后生效。");
  };
  return createPortal(<dialog ref={dialog} className="appearance-studio no-drag" aria-labelledby="studio-title" onCancel={(e) => { e.preventDefault(); if (!saving) onClose(); }} onKeyDown={(e) => e.stopPropagation()}>
    <header className="studio-header"><div><span className="studio-eyebrow">START ENGINEER / 外观</span><h2 id="studio-title">设计你的启动台</h2></div><div className="studio-history"><button disabled={saving || history.index === 0} onClick={() => setHistory((h) => ({ ...h, index: h.index - 1 }))}>撤销</button><button disabled={saving || history.index === history.entries.length - 1} onClick={() => setHistory((h) => ({ ...h, index: h.index + 1 }))}>重做</button></div></header>
    <div className="studio-body">
      <aside className="studio-inspector"><nav className="studio-tabs" aria-label="自定义界面步骤">{([["theme", "风格"], ["layout", "布局"], ["share", "分享"]] as const).map(([id, name]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{name}</button>)}</nav>
        <fieldset className="studio-controls" disabled={saving}>
          {tab === "theme" ? <><h3>从喜欢的风格开始</h3><p>选择主题，再调整颜色与玻璃效果。</p><div className="studio-themes">{themeOptions.map((theme) => <button key={theme.id} className={`theme-${theme.id}`} aria-pressed={draft.uiTheme === theme.id} onClick={() => change({ ...draft, uiTheme: theme.id })}><span className="theme-preview" aria-hidden="true"><i /><b /><em /></span><strong>{theme.name}</strong><small>{theme.description}</small></button>)}</div>
            {draft.uiTheme === "wallpaper" ? <><Choice label="玻璃明暗" value={draft.wallpaperGlassVariant} options={[["light", "浅色"], ["dark", "深色"]]} onChange={(value) => change({ ...draft, wallpaperGlassVariant: value })} /><Field label={`通透程度 · ${draft.wallpaperGlassIntensity}%`}><input type="range" min={0} max={100} value={draft.wallpaperGlassIntensity} onChange={(e) => change({ ...draft, wallpaperGlassIntensity: Number(e.target.value) })} /></Field></> : null}
            <Field label="背景颜色"><div className="studio-color"><input aria-label="背景颜色" type="color" value={draft.uiLayout.backgroundColor || "#EAF2FF"} onChange={(e) => layout({ backgroundColor: e.target.value })} /><code>{draft.uiLayout.backgroundColor || "跟随主题"}</code><button type="button" disabled={!draft.uiLayout.backgroundColor} onClick={() => layout({ backgroundColor: "" })}>重置</button></div></Field>
            <Choice label="背景氛围" value={draft.uiLayout.backgroundTone} options={[["default", "默认"], ["aurora", "极光"], ["graphite", "石墨"], ["mist", "薄雾"]]} onChange={(backgroundTone) => layout({ backgroundTone })} />
          </> : null}
          {tab === "layout" ? <><h3>让布局适合你的习惯</h3><p>预览会同步显示卡片、导航和留白的变化。</p>
            <fieldset className="studio-field"><legend>快速布局</legend><div className="studio-choices"><button onClick={() => layout({ cardSize: "small", gridDensity: "compact", sidebarWidth: "narrow", showAppNames: true })}>高效紧凑</button><button onClick={() => layout({ cardSize: "large", gridDensity: "relaxed", sidebarWidth: "wide", showAppNames: true })}>舒展展示</button><button onClick={() => layout(defaultUiLayoutPreferences)}>默认布局</button></div></fieldset>
            <Field label={`界面比例 · ${draft.uiLayout.uiScale}%`}><input type="range" min={80} max={125} value={draft.uiLayout.uiScale} onChange={(e) => layout({ uiScale: Number(e.target.value) })} /></Field>
            <Choice label="卡片大小" value={draft.uiLayout.cardSize} options={[["small", "小"], ["medium", "中"], ["large", "大"]]} onChange={(cardSize) => layout({ cardSize })} />
            <Choice label="卡片间距" value={draft.uiLayout.gridDensity} options={[["compact", "紧凑"], ["standard", "标准"], ["relaxed", "宽松"]]} onChange={(gridDensity) => layout({ gridDensity })} />
            <Choice label="侧栏宽度" value={draft.uiLayout.sidebarWidth} options={[["narrow", "窄"], ["standard", "标准"], ["wide", "宽"]]} onChange={(sidebarWidth) => layout({ sidebarWidth })} />
            <Choice label="品牌图标" value={draft.uiLayout.brandIconSize} options={[["standard", "标准"], ["large", "大"]]} onChange={(brandIconSize) => layout({ brandIconSize })} />
            {([["showAppNames", "应用名称"], ["showSearchBar", "搜索栏"], ["showBatchActions", "底部操作按钮"]] as const).map(([key, name]) => <label className="studio-toggle" key={key}><span>{name}</span><input type="checkbox" checked={draft.uiLayout[key]} onChange={(e) => layout({ [key]: e.target.checked })} /></label>)}
          </> : null}
          {tab === "share" ? <><h3>把整套界面分享出去</h3><p>包含主题、颜色、玻璃效果与布局。不包含应用、本地路径或权限设置。</p><button className="studio-primary studio-wide" onClick={() => void copy()}>复制当前设计的分享码</button><Field label="分享码"><textarea rows={7} placeholder="粘贴 seui: 开头的分享码" value={shareCode} onChange={(e) => { setShareCode(e.target.value); setMessage(""); }} spellCheck={false} /></Field><button className="studio-wide" disabled={!shareCode.trim()} onClick={importCode}>导入并预览</button><p>支持旧版布局分享码。导入后仍可继续调整，取消即可放弃。</p></> : null}
        </fieldset>
      </aside>
      <section className="studio-canvas" aria-label="设计预览"><div className="studio-preview-toolbar"><strong>实时预览</strong><div className="studio-choices"><button aria-pressed={!compact} onClick={() => setCompact(false)}>默认窗口</button><button aria-pressed={compact} onClick={() => setCompact(true)}>小屏幕</button></div></div><AppearancePreview appearance={draft} apps={apps} compact={compact} onInspect={() => setTab("layout")} /><p className="studio-preview-caption">{compact ? "1024 × 600" : "1461 × 810"} · 等比例预览 · 点击预览调整布局<br />透明主题在实际窗口中会透出你的桌面壁纸。</p></section>
    </div>
    <footer className="studio-footer"><span role="status" aria-live="polite">{message || (dirty ? "有未保存的调整" : "调整后预览，保存后应用到启动台")}</span><div><button disabled={saving} onClick={onClose}>取消</button><button className="studio-primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "正在保存…" : "保存并应用"}</button></div></footer>
  </dialog>, document.body);
}
