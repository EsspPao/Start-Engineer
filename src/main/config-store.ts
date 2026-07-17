import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type JsonConfigStoreOptions<T> = {
  path: () => string;
  normalize: (raw: unknown) => T;
  fallback: () => T;
  serialize?: (value: T) => unknown;
};

export class JsonConfigStore<T> {
  private cache: T | undefined;

  constructor(private readonly options: JsonConfigStoreOptions<T>) {}

  load() {
    if (this.cache !== undefined) return this.cache;
    try {
      this.cache = this.options.normalize(JSON.parse(readFileSync(this.options.path(), "utf8")));
      return this.cache;
    } catch {
      this.backupCorruptFile();
      return this.save(this.options.fallback());
    }
  }

  save(value: T) {
    const normalized = this.options.normalize(value);
    const path = this.options.path();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.options.serialize?.(normalized) ?? normalized, null, 2), "utf8");
    this.cache = normalized;
    return normalized;
  }

  clearCache() {
    this.cache = undefined;
  }

  private backupCorruptFile() {
    const path = this.options.path();
    if (!existsSync(path)) return;
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}.bak`);
    } catch { /* Keep running with defaults when backup is blocked. */ }
  }
}
