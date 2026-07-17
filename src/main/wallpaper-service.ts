import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { WallpaperBackgroundState } from "../shared/types.js";

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_DIMENSION = 16_384;
const MAX_PIXELS = 50_000_000;
const MIME_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

type WallpaperMetadata = { fileName: string; originalName: string; width: number; height: number; sizeBytes: number };
type WallpaperServiceOptions = {
  directory: () => string;
  pickFile: () => Promise<string | null>;
  imageSize: (path: string) => { width: number; height: number } | null;
};

export class WallpaperService {
  constructor(private readonly options: WallpaperServiceOptions) {}

  async pick(): Promise<WallpaperBackgroundState | null> {
    const source = await this.options.pickFile();
    if (!source) return null;
    const extension = extname(source).toLowerCase();
    if (!MIME_TYPES[extension]) throw new Error("请选择 PNG、JPG 或 WebP 图片");
    const stat = statSync(source);
    if (!stat.isFile() || stat.size <= 0) throw new Error("背景图片为空或无法读取");
    if (stat.size > MAX_FILE_BYTES) throw new Error("背景图片不能超过 16 MB");
    const size = this.options.imageSize(source);
    if (!size || size.width <= 0 || size.height <= 0) throw new Error("无法识别背景图片");
    if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION || size.width * size.height > MAX_PIXELS) {
      throw new Error("背景图片尺寸过大，请选择不超过 5000 万像素的图片");
    }

    const directory = this.options.directory();
    mkdirSync(directory, { recursive: true });
    const fileName = `background${extension}`;
    const temporaryPath = join(directory, `.background-${process.pid}-${Date.now()}${extension}`);
    copyFileSync(source, temporaryPath);
    this.removeImageFiles(fileName, temporaryPath);
    const target = join(directory, fileName);
    if (existsSync(target)) rmSync(target, { force: true });
    renameSync(temporaryPath, target);
    this.writeMetadata({ fileName, originalName: basename(source), width: size.width, height: size.height, sizeBytes: stat.size });
    return this.get();
  }

  get(): WallpaperBackgroundState {
    const metadata = this.readMetadata();
    if (!metadata) return { hasImage: false };
    const path = join(this.options.directory(), metadata.fileName);
    const extension = extname(path).toLowerCase();
    if (!existsSync(path) || !MIME_TYPES[extension]) return { hasImage: false };
    try {
      return {
        hasImage: true,
        dataUrl: `data:${MIME_TYPES[extension]};base64,${readFileSync(path).toString("base64")}`,
        fileName: metadata.originalName,
        width: metadata.width,
        height: metadata.height,
        sizeBytes: metadata.sizeBytes
      };
    } catch {
      return { hasImage: false };
    }
  }

  remove(): WallpaperBackgroundState {
    const directory = this.options.directory();
    if (existsSync(directory)) {
      for (const name of readdirSync(directory)) rmSync(join(directory, name), { force: true });
    }
    return { hasImage: false };
  }

  private metadataPath() { return join(this.options.directory(), "background.json"); }

  private readMetadata(): WallpaperMetadata | null {
    try {
      const value = JSON.parse(readFileSync(this.metadataPath(), "utf8")) as Partial<WallpaperMetadata>;
      if (typeof value.fileName !== "string" || typeof value.originalName !== "string" || typeof value.width !== "number" || typeof value.height !== "number" || typeof value.sizeBytes !== "number") return null;
      if (basename(value.fileName) !== value.fileName || !MIME_TYPES[extname(value.fileName).toLowerCase()] || !value.fileName.startsWith("background.")) return null;
      return value as WallpaperMetadata;
    } catch {
      return null;
    }
  }

  private writeMetadata(metadata: WallpaperMetadata) {
    const path = this.metadataPath();
    const temporaryPath = `${path}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(metadata, null, 2), "utf8");
    if (existsSync(path)) rmSync(path, { force: true });
    renameSync(temporaryPath, path);
  }

  private removeImageFiles(keepName: string, temporaryPath: string) {
    const directory = this.options.directory();
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (name !== keepName && path !== temporaryPath && name !== "background.json") rmSync(path, { force: true });
    }
  }
}
