import { useState, type MouseEvent } from "react";
import type { WallpaperBackgroundPreferences, WallpaperBackgroundState } from "../shared/types";

type Props = {
  background: WallpaperBackgroundState;
  value: WallpaperBackgroundPreferences;
  disabled: boolean;
  onPick: () => Promise<void>;
  onRemove: () => Promise<void>;
  onChange: (value: WallpaperBackgroundPreferences) => void;
};

export function WallpaperBackgroundSettings({ background, value, disabled, onPick, onRemove, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = (patch: Partial<WallpaperBackgroundPreferences>) => onChange({ ...value, ...patch });
  const run = async (operation: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(true);
    setMessage("");
    try { await operation(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "背景图片处理失败"); }
    finally { setBusy(false); }
  };
  const setFocus = (event: MouseEvent<HTMLButtonElement>) => {
    if (!background.hasImage) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    update({
      focusX: Math.round(((event.clientX - bounds.left) / bounds.width) * 100),
      focusY: Math.round(((event.clientY - bounds.top) / bounds.height) * 100)
    });
  };

  return <section className="wallpaper-background-settings">
    <button
      type="button"
      className={`wallpaper-background-preview ${background.hasImage ? "has-image" : "empty"}`}
      style={background.dataUrl ? { backgroundImage: `url("${background.dataUrl}")`, backgroundSize: value.fit, backgroundPosition: `${value.focusX}% ${value.focusY}%` } : undefined}
      disabled={disabled || busy}
      title={background.hasImage ? "单击图片调整视觉焦点" : "选择一张背景图片"}
      onClick={background.hasImage ? setFocus : () => void run(onPick)}
    >
      {!background.hasImage ? <span><strong>选择背景图片</strong><small>PNG、JPG 或 WebP，最大 16 MB</small></span> : <i style={{ left: `${value.focusX}%`, top: `${value.focusY}%` }} />}
    </button>
    <div className="wallpaper-background-controls">
      <header>
        <span><strong>{background.fileName || "自定义背景"}</strong><small>{background.width && background.height ? `${background.width} × ${background.height}` : "图片只保存在本机"}</small></span>
        <div><button className="ghost" disabled={disabled || busy} onClick={() => void run(onPick)}>{busy ? "处理中…" : background.hasImage ? "更换图片" : "选择图片"}</button>{background.hasImage ? <button className="shortcut-reset" disabled={disabled || busy} onClick={() => void run(onRemove)}>恢复默认</button> : null}</div>
      </header>
      <div className="wallpaper-background-row"><span><strong>显示方式</strong><small>铺满窗口或完整显示图片</small></span><div className="preference-options"><button disabled={disabled || busy} className={value.fit === "cover" ? "selected" : ""} onClick={() => update({ fit: "cover" })}>铺满</button><button disabled={disabled || busy} className={value.fit === "contain" ? "selected" : ""} onClick={() => update({ fit: "contain" })}>完整</button></div></div>
      <label className="wallpaper-background-slider"><span><strong>横向焦点</strong><output>{value.focusX}%</output></span><input aria-label="背景横向焦点" disabled={disabled || busy} type="range" min="0" max="100" value={value.focusX} onChange={(event) => update({ focusX: Number(event.target.value) })} /></label>
      <label className="wallpaper-background-slider"><span><strong>纵向焦点</strong><output>{value.focusY}%</output></span><input aria-label="背景纵向焦点" disabled={disabled || busy} type="range" min="0" max="100" value={value.focusY} onChange={(event) => update({ focusY: Number(event.target.value) })} /></label>
      <label className="wallpaper-background-slider"><span><strong>背景遮罩</strong><output>{value.dim}%</output></span><input aria-label="背景遮罩强度" disabled={disabled || busy} type="range" min="0" max="70" value={value.dim} onChange={(event) => update({ dim: Number(event.target.value) })} /></label>
      {message ? <em className="wallpaper-background-error">{message}</em> : null}
    </div>
  </section>;
}
