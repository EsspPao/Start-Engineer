import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WallpaperService } from "./wallpaper-service.js";

describe("wallpaper-service", () => {
  it("copies a selected image into managed storage and can restore the default", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-wallpaper-"));
    const source = join(root, "source.jpg");
    const directory = join(root, "managed");
    writeFileSync(source, Buffer.from([1, 2, 3, 4]));
    const service = new WallpaperService({ directory: () => directory, pickFile: async () => source, imageSize: () => ({ width: 1920, height: 1080 }) });

    const selected = await service.pick();
    expect(selected).toMatchObject({ hasImage: true, fileName: "source.jpg", width: 1920, height: 1080, sizeBytes: 4 });
    expect(selected?.dataUrl).toBe("data:image/jpeg;base64,AQIDBA==");
    expect(readFileSync(join(directory, "background.jpg"))).toEqual(Buffer.from([1, 2, 3, 4]));

    expect(service.remove()).toEqual({ hasImage: false });
    expect(existsSync(join(directory, "background.jpg"))).toBe(false);
    expect(service.get()).toEqual({ hasImage: false });
  });

  it("keeps the current background when the picker is cancelled", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-wallpaper-"));
    const service = new WallpaperService({ directory: () => root, pickFile: async () => null, imageSize: () => null });
    expect(await service.pick()).toBeNull();
  });

  it("rejects unsupported image types before copying", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-wallpaper-"));
    const source = join(root, "background.gif");
    writeFileSync(source, "gif");
    const service = new WallpaperService({ directory: () => join(root, "managed"), pickFile: async () => source, imageSize: () => ({ width: 100, height: 100 }) });
    await expect(service.pick()).rejects.toThrow("PNG、JPG 或 WebP");
  });
});
