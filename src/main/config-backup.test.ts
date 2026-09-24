import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigBackupService } from "./config-backup";
const roots: string[] = [];
const setup = () => { const root = mkdtempSync(join(tmpdir(), "se-backup-")); roots.push(root); return { root, service: new ConfigBackupService(root, "0.1.4") }; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("configuration protection", () => {
  it("starts clean without inventing a backup and backs up once per build before migration", () => {
    const { root, service } = setup();
    service.initialize("one"); expect(service.list()).toHaveLength(0);
    writeFileSync(join(root, "apps.json"), '[{"id":"one"}]');
    service.initialize("two"); service.initialize("two");
    expect(service.list()).toHaveLength(1);
    expect(service.list()[0].reason).toBe("升级前自动备份");
  });
  it("restores the full configuration and icons on next startup and preserves a rollback", () => {
    const { root, service } = setup();
    for (const name of ["apps.json", "groups.json", "folders.json", "group-grid-order.json"]) writeFileSync(join(root, name), '[{"id":"old"}]');
    writeFileSync(join(root, "preferences.json"), '{"uiTheme":"midnight"}');
    mkdirSync(join(root, "icons")); writeFileSync(join(root, "icons", "one.png"), Buffer.from([1,2,3]));
    service.initialize("one"); const backup = service.create();
    writeFileSync(join(root, "apps.json"), '[{"id":"new"}]');
    rmSync(join(root, "icons", "one.png"));
    service.prepareRestore(backup.id);
    expect(readFileSync(join(root, "apps.json"), "utf8")).toContain("new");
    service.initialize("one");
    expect(readFileSync(join(root, "apps.json"), "utf8")).toContain("old");
    expect(readFileSync(join(root, "preferences.json"), "utf8")).toContain("midnight");
    expect([...readFileSync(join(root, "icons", "one.png"))]).toEqual([1,2,3]);
    const rollback = service.list().find((item) => item.reason === "恢复前备份")!;
    service.prepareRestore(rollback.id); service.initialize("one");
    expect(readFileSync(join(root, "apps.json"), "utf8")).toContain("new");
  });
  it("rejects corrupted backups and path traversal without touching configuration", () => {
    const { root, service } = setup();
    writeFileSync(join(root, "apps.json"), "[]"); const backup = service.create();
    const path = join(root, "backups", backup.id + ".json");
    const data = JSON.parse(readFileSync(path, "utf8")); data.files["apps.json"] = '[{"id":"tampered"}]'; writeFileSync(path, JSON.stringify(data));
    expect(() => service.prepareRestore(backup.id)).toThrow();
    expect(() => service.prepareRestore("../../apps")).toThrow();
    expect(existsSync(join(root, "pending-restore.json"))).toBe(false);
    expect(readFileSync(join(root, "apps.json"), "utf8")).toBe("[]");
  });
});
