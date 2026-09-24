import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configFiles = ["apps.json", "groups.json", "folders.json", "group-grid-order.json", "preferences.json"] as const;
const limit = 64 * 1024 * 1024;
export type BackupSummary = { id: string; createdAt: string; version: string; reason: string; appCount: number };
type Backup = BackupSummary & { schema: 1; files: Record<string, string | null>; checksum: string };
const checksum = (files: Backup["files"]) => createHash("sha256").update(JSON.stringify(files)).digest("hex");
const validFile = (name: string) => configFiles.includes(name as typeof configFiles[number]) || /^icons\/[a-zA-Z0-9_-]+\.(png|ico|jpg|jpeg|webp)$/i.test(name);
export function atomicWrite(path: string, content: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, content); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export class ConfigBackupService {
  constructor(private readonly root: string, private readonly version: string) {}
  private get directory() { return join(this.root, "backups"); }
  private path(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("备份编号无效");
    return join(this.directory, `${id}.json`);
  }
  private read(id: string): Backup {
    const path = this.path(id);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("备份文件无效或过大");
    const value = JSON.parse(readFileSync(path, "utf8")) as Backup;
    if (value.schema !== 1 || value.id !== id || !value.files || checksum(value.files) !== value.checksum) throw new Error("备份内容损坏，未修改当前配置");
    for (const [name, content] of Object.entries(value.files)) {
      if (!validFile(name) || (content !== null && typeof content !== "string")) throw new Error("备份包含不支持的文件");
      if (!name.startsWith("icons/") && content !== null) {
        const parsed = JSON.parse(content);
        if (name === "preferences.json" ? !parsed || typeof parsed !== "object" || Array.isArray(parsed) : !Array.isArray(parsed)) throw new Error("备份配置格式无效");
      }
    }
    if (!configFiles.every((name) => Object.hasOwn(value.files, name))) throw new Error("备份配置不完整");
    return value;
  }
  list(): BackupSummary[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)).flatMap((name) => {
      try { const { id, createdAt, version, reason, appCount } = this.read(name.slice(0, -5)); return [{ id, createdAt, version, reason, appCount }]; }
      catch { return []; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  create(reason = "手动备份"): BackupSummary {
    mkdirSync(this.directory, { recursive: true });
    const files: Backup["files"] = {};
    for (const name of configFiles) files[name] = existsSync(join(this.root, name)) ? readFileSync(join(this.root, name), "utf8") : null;
    const icons = join(this.root, "icons");
    if (existsSync(icons) && !lstatSync(icons).isSymbolicLink()) for (const name of readdirSync(icons)) {
      const path = join(icons, name);
      if (validFile(`icons/${name}`) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()) files[`icons/${name}`] = readFileSync(path).toString("base64");
    }
    const summary = { id: randomUUID(), createdAt: new Date().toISOString(), version: this.version, reason, appCount: (() => { try { return JSON.parse(files["apps.json"] ?? "[]").length; } catch { return 0; } })() };
    const body = JSON.stringify({ ...summary, schema: 1, files, checksum: checksum(files) });
    if (Buffer.byteLength(body) > limit) throw new Error("配置备份超过 64 MB，请先清理图标缓存");
    atomicWrite(this.path(summary.id), body);
    return summary;
  }
  prepareRestore(id: string) {
    this.read(id);
    const safety = this.create("恢复前备份");
    atomicWrite(join(this.root, "pending-restore.json"), JSON.stringify({ target: id, safety: safety.id }));
  }
  private apply(value: Backup) {
    if (existsSync(join(this.root, "icons")) && lstatSync(join(this.root, "icons")).isSymbolicLink()) throw new Error("图标目录不是普通目录，恢复已停止");
    mkdirSync(join(this.root, "icons"), { recursive: true });
    for (const [name, content] of Object.entries(value.files)) {
      const path = join(this.root, name);
      if (content === null) rmSync(path, { force: true });
      else atomicWrite(path, name.startsWith("icons/") ? Buffer.from(content, "base64") : content);
    }
    rmSync(join(this.root, "startup-view-cache.json"), { force: true });
  }
  initialize(build: string) {
    mkdirSync(this.root, { recursive: true });
    const pending = join(this.root, "pending-restore.json");
    if (existsSync(pending)) {
      const request = JSON.parse(readFileSync(pending, "utf8"));
      const target = this.read(request.target);
      const safety = this.read(request.safety);
      try { this.apply(target); rmSync(pending); }
      catch (error) { this.apply(safety); throw error; }
    }
    const marker = join(this.root, "backup-build.json");
    let previous = "";
    try { previous = JSON.parse(readFileSync(marker, "utf8")).build; } catch { /* First protected launch. */ }
    if (previous !== build) {
      if (configFiles.some((name) => existsSync(join(this.root, name)))) this.create(previous ? "升级前自动备份" : "首次保护备份");
      atomicWrite(marker, JSON.stringify({ build }));
    }
  }
}
