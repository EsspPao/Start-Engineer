import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PreferencesService } from "./preferences-service.js";

function createService() {
  const root = mkdtempSync(join(tmpdir(), "start-engineer-preferences-"));
  let loginEnabled = false;
  let registered = "";
  const applyTheme = vi.fn();
  const service = new PreferencesService({
    path: () => join(root, "preferences.json"),
    loginExecutable: () => "C:\\StartEngineer.exe",
    prepareLoginExecutable: () => "C:\\StartEngineer.exe",
    loginArgs: ["--autostart"],
    getLoginItemEnabled: () => loginEnabled,
    setLoginItemEnabled: (enabled) => { loginEnabled = enabled; },
    registerShortcut: (accelerator) => { registered = accelerator; return true; },
    unregisterShortcut: () => { registered = ""; },
    isShortcutRegistered: (accelerator) => registered === accelerator,
    toggleMainWindow: vi.fn(),
    getAdministratorState: () => ({ isRunningAsAdministrator: false, administratorStatusLoading: false, elevatedTerminationStatus: "disabled" }),
    clearAdministratorMessage: vi.fn(),
    applyTheme
  });
  return { service, applyTheme, registered: () => registered };
}

describe("preferences-service", () => {
  it("updates login settings and reports the effective state", () => {
    const { service } = createService();
    expect(service.update({ launchAtStartup: true }).launchAtStartup).toBe(true);
  });

  it("prepares and reconciles the fast login executable", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-preferences-reconcile-"));
    let loginEnabled = false;
    const prepareLoginExecutable = vi.fn(() => "C:\\Fast\\Start Engineer.exe");
    const service = new PreferencesService({
      path: () => join(root, "preferences.json"),
      loginExecutable: () => "C:\\Fast\\Start Engineer.exe",
      prepareLoginExecutable,
      loginArgs: ["--autostart"],
      getLoginItemEnabled: () => loginEnabled,
      setLoginItemEnabled: (enabled) => { loginEnabled = enabled; },
      registerShortcut: () => true,
      unregisterShortcut: vi.fn(),
      isShortcutRegistered: () => false,
      toggleMainWindow: vi.fn(),
      getAdministratorState: () => ({ isRunningAsAdministrator: false, administratorStatusLoading: false, elevatedTerminationStatus: "disabled" }),
      clearAdministratorMessage: vi.fn(),
      applyTheme: vi.fn()
    });
    service.save({ ...service.load(), launchAtStartup: true });

    expect(service.reconcileLoginItem()).toBe(true);
    expect(prepareLoginExecutable).toHaveBeenCalledOnce();
    expect(service.snapshot().launchAtStartup).toBe(true);
  });

  it("replaces the registered global shortcut and persists it", () => {
    const { service, registered } = createService();
    const result = service.update({ globalShortcut: "Ctrl+Alt+K", globalShortcutEnabled: true });
    expect(registered()).toBe("Ctrl+Alt+K");
    expect(result.globalShortcut).toBe("Ctrl+Alt+K");
    expect(result.globalShortcutStatus).toBe("registered");
  });

  it("applies theme changes after persistence", () => {
    const { service, applyTheme } = createService();
    service.update({ uiTheme: "midnight" });
    expect(applyTheme).toHaveBeenCalledWith(expect.objectContaining({ uiTheme: "midnight" }));
  });
});
