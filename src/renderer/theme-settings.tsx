import type { WallpaperGlassIntensity, WallpaperGlassVariant } from "../shared/types";

export const wallpaperGlassIntensityOptions: Array<{ id: WallpaperGlassIntensity; label: string; title: string }> = [
  { id: "weak", label: "弱", title: "更不透明，适合明亮或复杂壁纸" },
  { id: "medium", label: "中", title: "推荐强度，兼顾融合和可读性" },
  { id: "strong", label: "强", title: "更透明，适合暗色或低干扰壁纸" },
];

export function WallpaperGlassIntensityControl({ value, disabled, onChange }: { value: WallpaperGlassIntensity; disabled?: boolean; onChange: (value: WallpaperGlassIntensity) => void }) {
  return (
    <div className="wallpaper-intensity-control" role="group" aria-label="壁纸融合强度">
      <span>融合强度</span>
      <div>
        {wallpaperGlassIntensityOptions.map((option) => (
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
