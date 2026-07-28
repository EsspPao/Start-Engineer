import { app, nativeImage } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppEntry } from "../shared/types.js";
import { APP_ICON_CACHE_VERSION, APP_ICON_TARGET_SIZE, shouldRefreshAppIcon } from "./icon-cache.js";
import { windowsStoreShellTarget } from "./windows-store-apps.js";

type IconServiceOptions = {
  iconCacheDir: () => string;
  loadApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[];
  runNativeHelper: (command: "icon", input: unknown, timeoutMs: number) => Promise<string>;
  runPowerShell: (script: string) => Promise<string>;
};

export function fallbackIconDataUrl(seed: string) {
  const label = [...seed].slice(0, 2).join("").toUpperCase() || "APP";
  const safeLabel = label.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#51b8f2"/><stop offset=".55" stop-color="#6268ee"/><stop offset="1" stop-color="#9765ec"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#g)"/><path d="M18 1h92a17 17 0 0 1 17 17v25C96 23 53 22 18 42Z" fill="white" opacity=".2"/><text x="64" y="77" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="white">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class IconService {
  private readonly processIconCache = new Map<string, string>();
  private refreshInFlight: Promise<AppEntry[]> | null = null;

  constructor(private readonly options: IconServiceOptions) {}

  async resolve(executablePath: string, seed: string) {
    if (!executablePath || !existsSync(executablePath)) return fallbackIconDataUrl(seed);
    const cacheKey = executablePath.toLowerCase();
    const cached = this.processIconCache.get(cacheKey);
    if (cached) return cached;
    try {
      const image = await app.getFileIcon(executablePath, { size: "normal" });
      const dataUrl = image.isEmpty() ? fallbackIconDataUrl(seed) : image.toDataURL();
      if (this.processIconCache.size >= 512) {
        const oldest = this.processIconCache.keys().next().value;
        if (oldest) this.processIconCache.delete(oldest);
      }
      this.processIconCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      return fallbackIconDataUrl(seed);
    }
  }

  async cache(entry: AppEntry) {
    const iconSource = entry.appUserModelId ? windowsStoreShellTarget(entry.appUserModelId) : entry.executablePath;
    if (!iconSource || (!entry.appUserModelId && !existsSync(iconSource))) return this.fallbackEntry(entry);
    try {
      mkdirSync(this.options.iconCacheDir(), { recursive: true });
      let image = await this.getShellIcon(iconSource).catch((reason) => {
        console.warn(`[icons] Shell extraction failed for ${entry.name}:`, reason);
        return null;
      });
      if (!image && existsSync(entry.executablePath)) image = await app.getFileIcon(entry.executablePath, { size: "large" });
      if (!image || image.isEmpty()) return this.fallbackEntry(entry);
      const iconPath = join(this.options.iconCacheDir(), `${entry.id}.png`);
      const iconDataUrl = image.toDataURL();
      const size = image.getSize();
      writeFileSync(iconPath, image.toPNG());
      this.processIconCache.set(iconSource.toLowerCase(), iconDataUrl);
      return { ...entry, iconCachePath: iconPath, iconDataUrl, iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: Math.min(size.width, size.height) };
    } catch (reason) {
      console.warn(`[icons] Icon cache failed for ${entry.name}:`, reason);
      return this.fallbackEntry(entry);
    }
  }

  refresh() {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const current = this.options.loadApps();
      const next = [...current];
      for (let index = 0; index < current.length; index += 1) {
        const entry = current[index];
        let cacheUsable = false;
        if (entry.iconCachePath && existsSync(entry.iconCachePath)) {
          const cachedImage = nativeImage.createFromPath(entry.iconCachePath);
          const size = cachedImage.getSize();
          cacheUsable = !cachedImage.isEmpty() && size.width > 0 && size.height > 0;
        }
        if (shouldRefreshAppIcon(entry, cacheUsable)) next[index] = await this.cache(entry);
      }
      return this.options.saveApps(next);
    })().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  private fallbackEntry(entry: AppEntry) {
    return { ...entry, iconCachePath: undefined, iconDataUrl: fallbackIconDataUrl(entry.name), iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: 0 };
  }

  private async getShellIcon(executablePath: string) {
    try {
      const output = await this.options.runNativeHelper("icon", { path: executablePath, pixelSize: APP_ICON_TARGET_SIZE }, 15_000);
      const result = JSON.parse(output) as { ok?: boolean; pngBase64?: string };
      if (result.ok && result.pngBase64) {
        const image = nativeImage.createFromBuffer(Buffer.from(result.pngBase64, "base64"));
        if (!image.isEmpty()) return image;
      }
    } catch { /* Fall back to the PowerShell/WPF extractor. */ }
    const encodedPath = Buffer.from(executablePath, "utf16le").toString("base64");
    const script = `
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct NativeSize { public int cx; public int cy; }
[Flags] public enum ShellImageFlags : uint { IconOnly = 0x00000004 }
[ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItemImageFactory { [PreserveSig] int GetImage(NativeSize size, ShellImageFlags flags, out IntPtr phbm); }
public static class ShellImage {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)] private static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext, ref Guid riid, out IShellItemImageFactory factory);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr handle);
  public static IntPtr GetBitmap(string path, int pixelSize) {
    Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"); IShellItemImageFactory factory;
    SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    try { NativeSize size = new NativeSize { cx = pixelSize, cy = pixelSize }; IntPtr bitmap; int result = factory.GetImage(size, ShellImageFlags.IconOnly, out bitmap); if (result != 0) Marshal.ThrowExceptionForHR(result); return bitmap; }
    finally { Marshal.ReleaseComObject(factory); }
  }
}
'@
$path = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPath}'))
$bitmapHandle = [ShellImage]::GetBitmap($path, ${APP_ICON_TARGET_SIZE})
if ($bitmapHandle -eq [IntPtr]::Zero) { throw "Shell icon extraction returned an empty bitmap" }
try {
  $source = [System.Windows.Interop.Imaging]::CreateBitmapSourceFromHBitmap($bitmapHandle, [IntPtr]::Zero, [System.Windows.Int32Rect]::Empty, [System.Windows.Media.Imaging.BitmapSizeOptions]::FromEmptyOptions())
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($source))
  $stream = New-Object IO.MemoryStream
  $encoder.Save($stream)
  [Convert]::ToBase64String($stream.ToArray())
} finally { [ShellImage]::DeleteObject($bitmapHandle) | Out-Null }
`;
    const output = (await this.options.runPowerShell(script)).trim();
    const image = nativeImage.createFromBuffer(Buffer.from(output, "base64"));
    return image.isEmpty() ? null : image;
  }
}
