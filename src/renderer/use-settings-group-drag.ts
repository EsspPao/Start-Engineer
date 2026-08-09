import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppGroup } from "../shared/types";
import { groupSortPreviewPosition } from "./drag-preview-position";
import type { RuntimeApp } from "./window-focus-feedback";

type SettingsGroupDragOptions = {
  groups: AppGroup[];
  apps: RuntimeApp[];
  onReorder: (ids: string[]) => Promise<boolean>;
  onMoveApp: (appId: string, groupId: string) => Promise<void>;
};

export function retainExpandedSettingsGroup(current: ReadonlySet<string>, groups: AppGroup[]) {
  const retained = [...current].find((id) => groups.some((group) => group.id === id));
  return new Set(retained ? [retained] : []);
}

export function toggleExpandedSettingsGroup(current: ReadonlySet<string>, id: string) {
  return current.has(id) ? new Set<string>() : new Set([id]);
}

export function useSettingsGroupDrag({ groups, apps, onReorder, onMoveApp }: SettingsGroupDragOptions) {
  const [ordered, setOrdered] = useState(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortPreview, setSortPreview] = useState<{ id: string; left: number; top: number; width: number } | null>(null);
  const [appDrag, setAppDrag] = useState<{ appId: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; targetGroup?: string } | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const flipRects = useRef(new Map<string, DOMRect>());
  const latestOrdered = useRef(ordered);
  const sortCandidate = useRef<{ id: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; original: AppGroup[]; active: boolean; valid: boolean } | null>(null);
  const appCandidate = useRef<{ appId: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number } | null>(null);
  const suppressAppClick = useRef(false);

  useEffect(() => {
    setOrdered(groups);
    setExpanded((current) => retainExpandedSettingsGroup(current, groups));
  }, [groups]);
  useEffect(() => { latestOrdered.current = ordered; }, [ordered]);

  const captureRects = () => {
    flipRects.current = new Map([...rows.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    if (!flipRects.current.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, element] of rows.current) {
      const before = flipRects.current.get(id);
      if (!before) continue;
      const after = element.getBoundingClientRect();
      const delta = before.top - after.top;
      if (!delta) continue;
      element.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    flipRects.current.clear();
  }, [ordered]);

  useEffect(() => {
    let frame = 0;
    let latestEvent: PointerEvent | null = null;
    const cancelSort = () => {
      const candidate = sortCandidate.current;
      sortCandidate.current = null;
      setSortPreview(null);
      if (candidate?.active) setOrdered(candidate.original);
    };
    const cancelApp = () => { appCandidate.current = null; setAppDrag(null); };
    const processMove = (event: PointerEvent) => {
      const sort = sortCandidate.current;
      if (sort) {
        if (!sort.active && Math.hypot(event.clientX - sort.startX, event.clientY - sort.startY) <= 6) return;
        sort.active = true;
        const source = rows.current.get(sort.id);
        if (!source) return;
        const sourceRect = source.getBoundingClientRect();
        const previewWidth = Math.min(sourceRect.width, 520);
        const { left, top } = groupSortPreviewPosition({ pointerX: event.clientX, pointerY: event.clientY, previewWidth, previewHeight: 64, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
        setSortPreview({ id: sort.id, left, top, width: previewWidth });
        const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-group]");
        const targetId = targetElement?.dataset.sortGroup;
        sort.valid = Boolean(targetId);
        if (!targetId || targetId === sort.id) return;
        const targetRect = targetElement.getBoundingClientRect();
        setOrdered((current) => {
          const from = current.findIndex((group) => group.id === sort.id);
          const target = current.findIndex((group) => group.id === targetId);
          if (from < 0 || target < 0) return current;
          let insertion = target + (event.clientY > targetRect.top + targetRect.height / 2 ? 1 : 0);
          if (from < insertion) insertion -= 1;
          if (insertion === from) return current;
          captureRects();
          const next = [...current];
          const [item] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(insertion, next.length)), 0, item);
          return next;
        });
        return;
      }

      const app = appCandidate.current;
      if (!app) return;
      if (!appDrag && Math.hypot(event.clientX - app.startX, event.clientY - app.startY) <= 6) return;
      suppressAppClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-settings-drop-group]")?.dataset.settingsDropGroup;
      const source = apps.find((item) => item.id === app.appId)?.groupId;
      setAppDrag({ appId: app.appId, x: event.clientX, y: event.clientY, grabOffsetX: app.grabOffsetX, grabOffsetY: app.grabOffsetY, targetGroup: target && target !== source ? target : undefined });
    };
    const move = (event: PointerEvent) => {
      latestEvent = event;
      if (!frame) frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (latestEvent) processMove(latestEvent);
      });
    };
    const up = () => {
      const sort = sortCandidate.current;
      if (sort) {
        sortCandidate.current = null;
        setSortPreview(null);
        if (sort.active) {
          if (!sort.valid) { setOrdered(sort.original); return; }
          const finalOrder = latestOrdered.current;
          void onReorder(finalOrder.map((group) => group.id)).then((saved) => { if (!saved) setOrdered(sort.original); });
        }
      }
      const app = appDrag;
      appCandidate.current = null;
      setAppDrag(null);
      if (app?.targetGroup) void onMoveApp(app.appId, app.targetGroup);
      window.setTimeout(() => { suppressAppClick.current = false; }, 0);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelSort();
      cancelApp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [appDrag, apps, onMoveApp, onReorder]);

  return {
    ordered,
    expanded,
    sortPreview,
    appDrag,
    rows,
    sortCandidate,
    appCandidate,
    suppressAppClick,
    draggedApp: apps.find((app) => app.id === appDrag?.appId),
    previewGroup: ordered.find((group) => group.id === sortPreview?.id),
    toggle: (id: string) => setExpanded((current) => toggleExpandedSettingsGroup(current, id))
  };
}
