import { ipcMain } from "electron";
import type { UpdatePreferencesInput } from "../shared/types.js";
import { PreferencesService } from "./preferences-service.js";

export function registerPreferencesIpc(preferences: PreferencesService, restartWithConfiguredPrivileges: () => Promise<void>) {
  ipcMain.handle("preferences:get", () => preferences.snapshot());
  ipcMain.handle("preferences:update", (_event, input: UpdatePreferencesInput) => preferences.update(input));
  ipcMain.handle("preferences:exportUiLayoutShareCode", () => preferences.exportUiLayoutShareCode());
  ipcMain.handle("preferences:importUiLayoutShareCode", (_event, code: string) => preferences.importUiLayoutShareCode(String(code ?? "")));
  ipcMain.handle("preferences:restartWithConfiguredPrivileges", () => restartWithConfiguredPrivileges());
}
