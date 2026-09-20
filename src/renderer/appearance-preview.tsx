import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppearancePreferences } from "../shared/appearance-share";
import { buildThemeAttributes } from "./theme-attributes";
import { GroupPage } from "./pages";
import { BrandLogo, Icon } from "./ui-icons";
import type { RuntimeApp } from "./window-focus-feedback";

const noop = () => {};
const sampleApps: RuntimeApp[] = ["游戏", "音乐", "笔记", "浏览器", "设计", "工具"].map((name, index) => ({
  id: `preview-${index}`, name, category: "tools", groupId: "preview", executablePath: "", processName: "", accent: "#5865f2",
  iconDataUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="${["#5865f2", "#db5d8c", "#199b91", "#268bd7", "#9563d9", "#d59130"][index]}"/><text x="32" y="43" text-anchor="middle" fill="white" font-size="32">${index + 1}</text></svg>`)}`,
  metrics: { appId: `preview-${index}`, isRunning: index < 2, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [], matchedPids: [], associatedPids: [], matchedProcessNames: [], matchedPaths: [] }
}));

export function AppearancePreview({ appearance, apps, compact, onInspect }: {
  appearance: AppearancePreferences; apps: RuntimeApp[]; compact: boolean; onInspect: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [previewRoot, setPreviewRoot] = useState<ShadowRoot | null>(null);
  const [scale, setScale] = useState(0.5);
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const width = compact ? 1024 : 1440;
  const height = compact ? 600 : 800;
  const theme = buildThemeAttributes(appearance, systemIsDark);
  const layout = appearance.uiLayout;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemIsDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / width, entry.contentRect.height / height)));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [width, height]);
  useEffect(() => {
    if (!frame.current) return;
    Object.assign(frame.current.dataset, { theme: theme.theme, wallpaperIntensity: String(theme.wallpaperIntensity), wallpaperVariant: theme.wallpaperVariant });
    frame.current.style.colorScheme = theme.colorScheme;
  }, [theme.theme, theme.wallpaperIntensity, theme.wallpaperVariant, theme.colorScheme]);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    element.setAttribute("inert", "");
    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    // Scope the production theme to this preview without changing the application's theme.
    style.textContent = [...document.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join("\n")).join("\n")
      .replace(/:root((?:\[[^\]]+\])*)/g, (_, attributes: string) => attributes ? `:host(${attributes})` : ":host");
    root.appendChild(style);
    setPreviewRoot(root);
    return () => style.remove();
  }, []);
  const preview = <main className="app-shell" style={{ ...theme.wallpaperStyle, "--ui-scale": layout.uiScale / 100, "--ui-scale-width": `${width * 100 / layout.uiScale}px`, "--ui-scale-height": `${height * 100 / layout.uiScale}px`, "--ui-background-color": layout.backgroundColor || "transparent" } as CSSProperties}
    data-theme={theme.theme} data-wallpaper-intensity={theme.wallpaperIntensity} data-wallpaper-variant={theme.wallpaperVariant}
    data-ui-card-size={layout.cardSize} data-ui-grid-density={layout.gridDensity} data-ui-sidebar-width={layout.sidebarWidth}
    data-ui-brand-icon-size={layout.brandIconSize} data-ui-background-tone={layout.backgroundTone} data-ui-custom-background={Boolean(layout.backgroundColor)}
    data-ui-show-search-bar={layout.showSearchBar} data-ui-show-batch-actions={layout.showBatchActions}>
    <aside className="sidebar"><div className="brand-icon"><BrandLogo /></div><nav className="nav"><button className="nav-button active"><Icon name="grid" />已添加应用</button><div className="nav-divider" />{["游戏", "办公", "工具"].map((name, i) => <button key={name} className="nav-button"><Icon name={["compass", "briefcase", "wrench"][i]} />{name}</button>)}</nav><button className="nav-button settings"><Icon name="settings" />设置</button></aside>
    <section className="window"><header className="topbar"><div className="page-heading"><h1>已添加应用</h1></div><section className="searchbar"><label><Icon name="search" /><input placeholder="搜索" readOnly tabIndex={-1} /></label></section><div className="window-controls"><button>−</button><button>□</button><button>×</button></div></header>
      <GroupPage apps={apps.length ? apps.slice(0, 12) : sampleApps} runtimeStates={{}} selectedAppId="" invalidAppIds={new Set()} runningCount={(apps.length ? apps : sampleApps).filter((app) => app.metrics.isRunning).length} showAppNames={layout.showAppNames} onSelectApp={noop} onFocusApp={noop} onLaunchApp={noop} onLaunchingFeedback={noop} onCloseAll={noop} onAdd={noop} onContextMenu={(e) => e.preventDefault()} onPointerDown={noop} onRequestClose={noop} />
    </section>
  </main>;
  return <div className="studio-preview-stage" ref={host}>
    <div ref={frame} className="studio-preview-surface" aria-hidden="true" style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }} />
    <button className="studio-preview-inspect" aria-label="调整预览布局" onClick={onInspect} />
    {previewRoot ? createPortal(preview, previewRoot) : null}
  </div>;
}
