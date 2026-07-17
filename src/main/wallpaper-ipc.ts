import { ipcMain } from "electron";
import { WallpaperService } from "./wallpaper-service.js";

export function registerWallpaperIpc(wallpaper: WallpaperService) {
  ipcMain.handle("wallpaper:get", () => wallpaper.get());
  ipcMain.handle("wallpaper:pick", () => wallpaper.pick());
  ipcMain.handle("wallpaper:remove", () => wallpaper.remove());
}
