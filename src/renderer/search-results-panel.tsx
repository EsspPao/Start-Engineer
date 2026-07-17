import React, { useEffect, useRef } from "react";
import type { DiscoveredAppCandidate, EverythingSearchResult, InstallableAppCandidate, InternalSearchResult } from "../shared/types";
import { SEARCH_RESULT_OPTION_ATTRIBUTE, scrollSelectedSearchResultIntoView } from "./search-panel-behavior";

export function SearchResultsPanel({ query, loading, error, selectedIndex, managedResults, discoveredResults, installableResults, fileResults, onSelectIndex, onOpenManaged, onAddDiscovered, onOpenInstallable, onOpenFile }: { query: string; loading: boolean; error: string; selectedIndex: number; managedResults: Array<Extract<InternalSearchResult, { kind: "app" }>>; discoveredResults: DiscoveredAppCandidate[]; installableResults: InstallableAppCandidate[]; fileResults: EverythingSearchResult[]; onSelectIndex: (index: number) => void; onOpenManaged: (result: Extract<InternalSearchResult, { kind: "app" }>) => void; onAddDiscovered: (candidate: DiscoveredAppCandidate) => void; onOpenInstallable: (candidate: InstallableAppCandidate) => void; onOpenFile: (result: EverythingSearchResult) => void }) {
  const appResultCount = managedResults.length + discoveredResults.length + installableResults.length;
  const showFileFallback = !appResultCount && Boolean(fileResults.length);
  const resultCount = appResultCount || fileResults.length;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => scrollSelectedSearchResultIntoView(panelRef.current, selectedIndex), [selectedIndex, resultCount]);
  return <div ref={panelRef} className="search-results-panel" role="listbox" aria-label="搜索结果" onPointerDown={(event) => event.stopPropagation()}>
    <div className="search-results-title"><span>搜索应用</span><small>{loading ? "搜索中…" : `${resultCount} 个结果`}</small></div>
    {error ? <div className="search-results-error"><strong>{error}</strong></div> : null}
    {!error && !loading && !resultCount ? <div className="search-results-empty">没有找到“{query}”的匹配结果。</div> : null}
    {!error && managedResults.length ? <ResultSection title="已添加应用" hint="Enter 启动 / 唤起">{managedResults.map((result, index) => <ResultButton key={`managed-${result.id}`} index={index} selectedIndex={selectedIndex} kind="internal" onSelectIndex={onSelectIndex} onClick={() => onOpenManaged(result)} icon="grid" name={result.name} detail={`${result.processName}${result.isRunning ? " · 运行中" : ""}`} status="✓" statusClass="added" statusTitle="已添加" />)}</ResultSection> : null}
    {!error && discoveredResults.length ? <ResultSection title="本机可添加应用" hint="Enter 添加">{discoveredResults.map((result, offset) => {
      const index = managedResults.length + offset;
      return <ResultButton key={`discovered-${result.id}`} index={index} selectedIndex={selectedIndex} kind="internal" onSelectIndex={onSelectIndex} onClick={() => onAddDiscovered(result)} icon="grid" name={result.name} detail={result.source === "start-menu" ? "开始菜单" : result.source === "desktop" ? "桌面快捷方式" : "本机结果"} status={result.alreadyAdded ? "✓" : "+"} statusClass={result.alreadyAdded ? "added" : "add"} statusTitle={result.alreadyAdded ? "已添加" : "添加到当前分组"} />;
    })}</ResultSection> : null}
    {!error && installableResults.length ? <ResultSection title="可安装应用" hint="Enter 打开下载页">{installableResults.map((result, offset) => {
      const index = managedResults.length + discoveredResults.length + offset;
      return <ResultButton key={`installable-${result.id}`} index={index} selectedIndex={selectedIndex} kind="internal" onSelectIndex={onSelectIndex} onClick={() => onOpenInstallable(result)} icon="search" name={result.name} detail={`${result.publisher} · 官方下载页`} status="打开" statusClass="open" statusTitle="打开官方下载页" />;
    })}</ResultSection> : null}
    {!error && showFileFallback ? <ResultSection title="Everything 搜索结果" hint="Enter 打开">{fileResults.map((result, index) => <ResultButton key={`file-${result.path}`} index={index} selectedIndex={selectedIndex} kind="file" onSelectIndex={onSelectIndex} onClick={() => onOpenFile(result)} icon="search" name={result.name} detail={result.path} status="打开" statusClass="open" statusTitle="打开" />)}</ResultSection> : null}
  </div>;
}

function ResultSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div className="search-results-section"><div className="search-results-title compact"><span>{title}</span><small>{hint}</small></div>{children}</div>;
}

function ResultButton({ index, selectedIndex, kind, onSelectIndex, onClick, icon, name, detail, status, statusClass, statusTitle }: { index: number; selectedIndex: number; kind: "internal" | "file"; onSelectIndex: (index: number) => void; onClick: () => void; icon: "grid" | "search"; name: string; detail: string; status: string; statusClass: string; statusTitle: string }) {
  return <button className={`search-result-row ${kind} ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={onClick}><ResultIcon name={icon} /><span><strong>{name}</strong><small>{detail}</small></span><em className={`search-result-status ${statusClass}`} title={statusTitle}>{status}</em></button>;
}

function ResultIcon({ name }: { name: "grid" | "search" }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  return name === "search" ? <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg> : <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
}
