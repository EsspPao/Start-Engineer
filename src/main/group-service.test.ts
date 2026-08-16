import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types";
import { GroupService } from "./group-service";

const app = (id: string, groupId = "games"): AppEntry => ({ id, name: id, category: groupId, groupId, executablePath: `C:\\${id}.exe`, processName: id, accent: "#fff" });

function setup(initialApps = [app("a"), app("b"), app("c")]) {
  const root = mkdtempSync(join(tmpdir(), "start-engineer-groups-"));
  let apps = initialApps;
  let id = 0;
  const service = new GroupService({
    groupsPath: () => join(root, "groups.json"),
    foldersPath: () => join(root, "folders.json"),
    gridPath: () => join(root, "grid.json"),
    getApps: () => apps,
    saveApps: (next) => { apps = next; return next; },
    randomId: () => `id-${++id}`
  });
  return { service, getApps: () => apps };
}

describe("GroupService", () => {
  it("creates a folder and replaces member cards in the mixed grid", () => {
    const { service } = setup();
    service.saveGridOrders([{ groupId: "games", itemIds: ["app:a", "app:b", "app:c"] }]);
    const folders = service.createFolder({ groupId: "games", appIds: ["a", "b"] });
    expect(folders).toMatchObject([{ id: "id-1", appIds: ["a", "b"] }]);
    expect(service.loadGridOrders().find((order) => order.groupId === "games")?.itemIds).toEqual(["folder:id-1", "app:c"]);
  });

  it("moves a folder and every member to the target group atomically", () => {
    const { service, getApps } = setup();
    const folder = service.createFolder({ groupId: "games", appIds: ["a", "b"] })[0];
    const result = service.moveFolder(folder.id, "office");
    expect(result.folders[0].groupId).toBe("office");
    expect(getApps().filter((entry) => ["a", "b"].includes(entry.id)).every((entry) => entry.groupId === "office")).toBe(true);
  });

  it("merges every source-folder member into the target folder and removes the source card", () => {
    const { service } = setup([app("a"), app("b"), app("c"), app("d")]);
    service.saveGridOrders([{ groupId: "games", itemIds: ["app:a", "app:b", "app:c", "app:d"] }]);
    const source = service.createFolder({ groupId: "games", name: "来源", appIds: ["a", "b"] })[0];
    const target = service.createFolder({ groupId: "games", name: "目标", appIds: ["c", "d"] }).find((folder) => folder.name === "目标")!;

    const result = service.mergeFolders(source.id, target.id);

    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]).toMatchObject({ id: target.id, name: "目标", appIds: ["c", "d", "a", "b"] });
    expect(result.gridOrders.find((order) => order.groupId === "games")?.itemIds).toEqual([`folder:${target.id}`]);
  });

  it("rejects merging a multi-app card into itself", () => {
    const { service } = setup();
    const folder = service.createFolder({ groupId: "games", appIds: ["a", "b"] })[0];
    expect(() => service.mergeFolders(folder.id, folder.id)).toThrow("目标多应用卡片无效");
  });

  it("rejects incomplete mixed-grid orders", () => {
    const { service } = setup();
    expect(() => service.reorderGrid("games", ["app:a"])).toThrow("网格排序数据无效");
  });
});
