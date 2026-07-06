import type { WallpaperGlassIntensity, WallpaperGlassVariant } from "../shared/types";

function clampIntensity(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function WallpaperGlassIntensityControl({ value, disabled, onChange, onCommit }: { value: WallpaperGlassIntensity; disabled?: boolean; onChange: (value: WallpaperGlassIntensity) => void; onCommit?: () => void }) {
  const intensity = clampIntensity(value);
  const update = (next: string) => {
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) return;
    onChange(clampIntensity(parsed));
  };
  return (
    <div className="wallpaper-intensity-control" role="group" aria-label="壁纸融合强度">
      <span>融合强度</span>
      <div className="wallpaper-intensity-slider">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={intensity}
          disabled={disabled}
          aria-label="融合强度"
          onChange={(event) => update(event.currentTarget.value)}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={intensity}
          disabled={disabled}
          aria-label="输入融合强度"
          onChange={(event) => update(event.currentTarget.value)}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <em>%</em>
      </div>
    </div>
  );
}

const wallpaperGlassVariantOptions: Array<{ id: WallpaperGlassVariant; label: string; title: string }> = [
  { id: "dark", label: "深色", title: "深色玻璃，适合暗色或高对比动态壁纸" },
  { id: "light", label: "浅色", title: "浅色玻璃，适合柔和、明亮或浅色动态壁纸" },
];

export function WallpaperGlassVariantControl({ value, disabled, onChange }: { value: WallpaperGlassVariant; disabled?: boolean; onChange: (value: WallpaperGlassVariant) => void }) {
  return (
    <div className="wallpaper-variant-control" role="group" aria-label="壁纸玻璃色调">
      <span>玻璃色调</span>
      <div>
        {wallpaperGlassVariantOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "selected" : ""}
            disabled={disabled}
            title={option.title}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
