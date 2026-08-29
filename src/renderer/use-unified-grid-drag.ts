import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppEntry, AppFolder, GroupGridItemId, GroupGridOrder, StartEngineerApi } from "../shared/types";
import { hitTestAppOrder, reuseOrderIfEqual, type AppDragRect } from "./app-drag-order";
import { cleanErrorMessage } from "./error-message";
import { isEscapeKeyboardEvent } from "./keyboard-navigation";
import { primaryPointerButtonReleased } from "./pointer-drag-lifecycle";

type AppGroupId = AppEntry["groupId"];
export type MergeTarget = { kind: "app" | "folder"; id: string };
export type DragState = { appId: string; itemId?: GroupGridItemId; folderId?: string; sourceFolderId?: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number; targetGroup?: AppGroupId; targetFolderId?: string; mergeCandidateTarget?: MergeTarget; targetAppId?: string; reorderGroupId?: AppGroupId; previewOrder?: string[] } | null;
export type UnifiedDragCandidate = { kind: "app" | "folder"; appId?: string; folderId?: string; sourceFolderId?: string; itemId: GroupGridItemId; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number; initialOrder?: GroupGridItemId[]; initialRects?: AppDragRect[] };
type MergeRect = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;
type MergePointerHit = { folderId?: string; folderRect?: MergeRect; appId?: string; appRect?: MergeRect };

type FolderMutation = Awaited<ReturnType<StartEngineerApi["moveFolderMember"]>>;

type UseUnifiedGridDragOptions = {
  client: StartEngineerApi;
  activeSection: string;
  apps: AppEntry[];
  folders: AppFolder[];
  candidateRef: MutableRefObject<UnifiedDragCandidate | null>;
  setDrag: (state: DragState) => void;
  applyFolderMutation: (result: FolderMutation) => void;
  setFolders: Dispatch<SetStateAction<AppFolder[]>>;
  setGroupGridOrders: Dispatch<SetStateAction<GroupGridOrder[]>>;
  setError: (message: string) => void;
  onGroupTransfer: (targetGroupId: string, operation: Promise<unknown>) => void;
  onFolderMergeComplete: (targetFolderId: string) => void;
};

const APP_MERGE_HOVER_MS = 380;

function isInsideMergeZone(x: number, y: number, rect: MergeRect, horizontalInset: number, verticalInset: number) {
  return x >= rect.left + rect.width * horizontalInset
    && x <= rect.right - rect.width * horizontalInset
    && y >= rect.top + rect.height * verticalInset
    && y <= rect.bottom - rect.height * verticalInset;
}

export function resolveMergeCandidateTarget(candidate: Pick<UnifiedDragCandidate, "kind" | "appId" | "folderId" | "sourceFolderId">, x: number, y: number, hit: MergePointerHit): MergeTarget | undefined {
  if (candidate.kind === "folder" && hit.folderId && hit.folderId !== candidate.folderId && hit.folderRect
    && isInsideMergeZone(x, y, hit.folderRect, .12, .12)) return { kind: "folder", id: hit.folderId };
  if (candidate.kind === "app" && hit.folderId && hit.folderId !== candidate.sourceFolderId && hit.folderRect
    && isInsideMergeZone(x, y, hit.folderRect, .12, .12)) return { kind: "folder", id: hit.folderId };
  if (candidate.kind === "app" && !candidate.sourceFolderId && hit.appId && hit.appId !== candidate.appId && hit.appRect
    && isInsideMergeZone(x, y, hit.appRect, .2, .18)) return { kind: "app", id: hit.appId };
  return undefined;
}

export function useUnifiedGridDrag(options: UseUnifiedGridDragOptions) {
  const { client, activeSection, apps, folders, candidateRef, setDrag, applyFolderMutation, setFolders, setGroupGridOrders, setError, onGroupTransfer, onFolderMergeComplete } = options;
  const dragState = useRef<DragState>(null);
  const mergeHover = useRef<{ target: MergeTarget; since: number; readyTimer: number } | null>(null);

  useEffect(() => {
    const updateMergeFeedback = (mergeTarget?: MergeTarget, ready = false) => {
      const active = document.querySelector<HTMLElement>(".unified-grid .app-card-wrap.merge-pending, .unified-grid .app-card-wrap.merge-ready");
      const target = mergeTarget ? document.querySelector<HTMLElement>(`.unified-grid > [data-grid-item-id="${mergeTarget.kind}:${CSS.escape(mergeTarget.id)}"]`) : null;
      if (active && active !== target) active.classList.remove("merge-pending", "merge-ready", "merge-folder-target");
      const preview = document.querySelector<HTMLElement>(".app-card-drag-preview");
      if (!target || !mergeTarget) {
        preview?.classList.remove("merge-preview-pending", "merge-preview-ready", "merge-preview-folder");
        preview?.style.removeProperty("--merge-shift-x");
        preview?.style.removeProperty("--merge-shift-y");
        return;
      }
      target.classList.toggle("merge-folder-target", mergeTarget.kind === "folder");
      if (ready) {
        target.classList.remove("merge-pending");
        target.classList.add("merge-ready");
      } else if (!target.classList.contains("merge-pending") && !target.classList.contains("merge-ready")) target.classList.add("merge-pending");
      if (!preview) return;
      if (ready) {
        preview.classList.remove("merge-preview-pending");
        preview.classList.add("merge-preview-ready");
      } else if (!preview.classList.contains("merge-preview-pending") && !preview.classList.contains("merge-preview-ready")) preview.classList.add("merge-preview-pending");
      preview.classList.toggle("merge-preview-folder", mergeTarget.kind === "folder");
      const targetRect = target.getBoundingClientRect();
      const previewLeft = Number.parseFloat(preview.style.left);
      const previewTop = Number.parseFloat(preview.style.top);
      const previewWidth = Number.parseFloat(preview.style.width);
      const previewHeight = Number.parseFloat(preview.style.height);
      preview.style.setProperty("--merge-shift-x", `${targetRect.left + targetRect.width / 2 - previewLeft - previewWidth / 2}px`);
      preview.style.setProperty("--merge-shift-y", `${targetRect.top + targetRect.height / 2 - previewTop - previewHeight / 2}px`);
    };
    const resetMergeHover = () => {
      if (mergeHover.current) window.clearTimeout(mergeHover.current.readyTimer);
      mergeHover.current = null;
    };
    const cancel = () => {
      const hadUnifiedDrag = Boolean(candidateRef.current || dragState.current);
      candidateRef.current = null;
      dragState.current = null;
      resetMergeHover();
      updateMergeFeedback();
      if (!hadUnifiedDrag) return;
      delete document.documentElement.dataset.cardDragging;
      setDrag(null);
    };
    const move = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate) return;
      if (primaryPointerButtonReleased(event)) { cancel(); return; }
      if (Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) <= 6) return;
      document.documentElement.dataset.cardDragging = "true";
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const targetGroup = hit?.closest<HTMLElement>("[data-drop-group]")?.dataset.dropGroup;
      const targetFolderNode = hit?.closest<HTMLElement>("[data-folder-id]");
      const targetFolderId = targetFolderNode?.dataset.folderId;
      const targetAppNode = hit?.closest<HTMLElement>("[data-app-card-id]");
      const targetAppId = targetAppNode?.dataset.appCardId;
      if (!candidate.initialOrder || !candidate.initialRects) {
        const nodes = [...document.querySelectorAll<HTMLElement>(".unified-grid > [data-grid-item-id]")];
        candidate.initialOrder = nodes.map((node) => node.dataset.gridItemId).filter((id): id is GroupGridItemId => Boolean(id));
        candidate.initialRects = nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { id: node.dataset.gridItemId ?? "", left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }).filter((rect) => rect.id);
        if (candidate.sourceFolderId && !candidate.initialOrder.includes(candidate.itemId)) candidate.initialOrder.push(candidate.itemId);
      }
      const ids = candidate.initialOrder;
      const rects = candidate.initialRects;
      const mergeCandidateTarget = resolveMergeCandidateTarget(candidate, event.clientX, event.clientY, {
        folderId: targetFolderId,
        folderRect: targetFolderNode?.getBoundingClientRect(),
        appId: targetAppId,
        appRect: targetAppNode?.getBoundingClientRect()
      });
      if (mergeCandidateTarget) {
        const sameTarget = mergeHover.current?.target.kind === mergeCandidateTarget.kind && mergeHover.current.target.id === mergeCandidateTarget.id;
        if (!sameTarget) {
          resetMergeHover();
          const target = mergeCandidateTarget;
          mergeHover.current = { target, since: performance.now(), readyTimer: window.setTimeout(() => updateMergeFeedback(target, true), APP_MERGE_HOVER_MS) };
        }
      } else resetMergeHover();
      const mergeIsReady = Boolean(mergeCandidateTarget && mergeHover.current && performance.now() - mergeHover.current.since >= APP_MERGE_HOVER_MS);
      updateMergeFeedback(mergeCandidateTarget, mergeIsReady);
      const nextPreviewOrder = !targetGroup
        ? mergeCandidateTarget ? dragState.current?.previewOrder ?? ids : hitTestAppOrder(ids, rects, candidate.itemId, event.clientX, event.clientY)
        : undefined;
      const previewOrder = nextPreviewOrder?.length === ids.length && ids.length
        ? reuseOrderIfEqual(dragState.current?.previewOrder, nextPreviewOrder)
        : undefined;
      const nextDrag: DragState = {
        appId: candidate.appId ?? "", itemId: candidate.itemId, folderId: candidate.folderId, sourceFolderId: candidate.sourceFolderId,
        x: event.clientX, y: event.clientY, grabOffsetX: candidate.grabOffsetX, grabOffsetY: candidate.grabOffsetY,
        width: candidate.width, height: candidate.height, targetGroup: targetGroup as AppGroupId | undefined,
        targetFolderId: mergeIsReady && mergeCandidateTarget?.kind === "folder" ? mergeCandidateTarget.id : undefined,
        mergeCandidateTarget, targetAppId: mergeIsReady && mergeCandidateTarget?.kind === "app" ? mergeCandidateTarget.id : undefined,
        reorderGroupId: previewOrder?.length === ids.length && ids.length ? activeSection : undefined,
        previewOrder: previewOrder?.length === ids.length && ids.length ? previewOrder : undefined,
      };
      dragState.current = nextDrag;
      setDrag(nextDrag);
      if (mergeCandidateTarget) window.requestAnimationFrame(() => {
        const currentTarget = dragState.current?.mergeCandidateTarget;
        if (currentTarget?.kind === mergeCandidateTarget.kind && currentTarget.id === mergeCandidateTarget.id) updateMergeFeedback(mergeCandidateTarget, mergeIsReady);
      });
    };
    const up = () => {
      const candidate = candidateRef.current;
      let current = dragState.current;
      const wasDragging = Boolean(current);
      if (current && candidate && mergeHover.current && performance.now() - mergeHover.current.since >= APP_MERGE_HOVER_MS) {
        if (candidate.kind === "app") {
          current = mergeHover.current.target.kind === "app"
            ? { ...current, targetAppId: mergeHover.current.target.id, targetFolderId: undefined }
            : { ...current, targetFolderId: mergeHover.current.target.id, targetAppId: undefined };
        } else if (mergeHover.current.target.kind === "folder") {
          current = { ...current, targetFolderId: mergeHover.current.target.id, targetAppId: undefined };
        }
      }
      candidateRef.current = null;
      dragState.current = null;
      resetMergeHover();
      updateMergeFeedback();
      setDrag(null);
      if (!candidate || !wasDragging) return;
      window.setTimeout(() => { delete document.documentElement.dataset.cardDragging; }, 0);
      if (candidate.kind === "folder" && candidate.folderId) {
        if (current?.targetFolderId && current.targetFolderId !== candidate.folderId) {
          const targetFolderId = current.targetFolderId;
          void client.mergeFolders(candidate.folderId, targetFolderId).then((result) => {
            applyFolderMutation(result);
            onFolderMergeComplete(targetFolderId);
          }).catch((reason) => setError(cleanErrorMessage(reason, "合并多应用卡片失败")));
        } else if (current?.targetGroup) {
          const operation = client.moveFolder(candidate.folderId, current.targetGroup);
          onGroupTransfer(current.targetGroup, operation);
          void operation.then(applyFolderMutation).catch((reason) => setError(cleanErrorMessage(reason, "移动多应用卡片失败")));
        } else if (current?.previewOrder) void client.reorderGroupItems(activeSection, current.previewOrder as GroupGridItemId[]).then(setGroupGridOrders).catch((reason) => setError(cleanErrorMessage(reason, "卡片排序失败")));
        return;
      }
      if (!candidate.appId) return;
      if (candidate.sourceFolderId) {
        if (current?.targetFolderId === candidate.sourceFolderId) return;
        const target = current?.targetFolderId && current.targetFolderId !== candidate.sourceFolderId
          ? { kind: "folder" as const, folderId: current.targetFolderId }
          : current?.targetGroup ? { kind: "group" as const, groupId: current.targetGroup }
            : { kind: "outer" as const, groupId: activeSection, index: current?.previewOrder?.indexOf(candidate.itemId) };
        const operation = client.moveFolderMember({ appId: candidate.appId, sourceFolderId: candidate.sourceFolderId, target });
        if (target.kind === "group") onGroupTransfer(target.groupId, operation);
        void operation.then(applyFolderMutation).catch((reason) => setError(cleanErrorMessage(reason, "移出应用失败")));
      } else if (current?.targetAppId) {
        const source = apps.find((app) => app.id === candidate.appId);
        if (source) void client.createFolder({ groupId: source.groupId, appIds: [candidate.appId, current.targetAppId] }).then(async (nextFolders) => {
          setFolders(nextFolders);
          setGroupGridOrders(await client.listGroupGridOrders());
        }).catch((reason) => setError(cleanErrorMessage(reason, "创建多应用卡片失败")));
      } else if (current?.targetFolderId) {
        const folder = folders.find((item) => item.id === current.targetFolderId);
        if (folder && !folder.appIds.includes(candidate.appId)) void client.updateFolder({ id: folder.id, appIds: [...folder.appIds, candidate.appId] }).then(async (nextFolders) => {
          setFolders(nextFolders);
          setGroupGridOrders(await client.listGroupGridOrders());
        }).catch((reason) => setError(cleanErrorMessage(reason, "加入多应用卡片失败")));
      } else if (current?.targetGroup) {
        const operation = client.setAppGroup(candidate.appId, current.targetGroup);
        onGroupTransfer(current.targetGroup, operation);
        void operation.then(async (nextApps) => applyFolderMutation({ apps: nextApps, folders: await client.listFolders(), gridOrders: await client.listGroupGridOrders() }))
          .catch((reason) => setError(cleanErrorMessage(reason, "移动应用失败")));
      } else if (current?.previewOrder) void client.reorderGroupItems(activeSection, current.previewOrder as GroupGridItemId[]).then(setGroupGridOrders);
    };
    const key = (event: KeyboardEvent) => { if (isEscapeKeyboardEvent(event)) cancel(); };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      resetMergeHover();
      updateMergeFeedback();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (candidateRef.current || dragState.current) cancel();
    };
  }, [activeSection, applyFolderMutation, apps, candidateRef, client, folders, onFolderMergeComplete, onGroupTransfer, setDrag, setError, setFolders, setGroupGridOrders]);
}
