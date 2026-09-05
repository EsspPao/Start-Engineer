import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

type StartupExecutableOptions = {
  execPath: string;
  portableExecutable?: string;
  localAppDataPath: string;
  version: string;
};

type RuntimeMarker = {
  version: string;
  portableSize: number;
  portableModifiedAt: number;
};

export class StartupExecutableResolver {
  constructor(private readonly options: StartupExecutableOptions) {}

  path() {
    if (!this.options.portableExecutable?.trim()) return this.options.execPath;
    return join(this.runtimeDirectory(), basename(this.options.execPath));
  }

  prepare() {
    const portableExecutable = this.options.portableExecutable?.trim();
    if (!portableExecutable) return this.options.execPath;
    const expected = this.marker(portableExecutable);
    if (this.currentMarkerMatches(expected) && existsSync(this.path())) return this.path();

    const target = this.runtimeDirectory();
    const staging = `${target}.staging-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(dirname(this.options.execPath), staging, { recursive: true });
      writeFileSync(join(staging, "startup-runtime.json"), JSON.stringify(expected), "utf8");
      rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
    } catch (reason) {
      rmSync(staging, { recursive: true, force: true });
      throw reason;
    }
    return this.path();
  }

  private runtimeDirectory() {
    return join(this.options.localAppDataPath, "Start Engineer", "startup-runtime");
  }

  private marker(portableExecutable: string): RuntimeMarker {
    const stat = statSync(portableExecutable);
    return { version: this.options.version, portableSize: stat.size, portableModifiedAt: Math.round(stat.mtimeMs) };
  }

  private currentMarkerMatches(expected: RuntimeMarker) {
    try {
      const current = JSON.parse(readFileSync(join(this.runtimeDirectory(), "startup-runtime.json"), "utf8")) as RuntimeMarker;
      return current.version === expected.version
        && current.portableSize === expected.portableSize
        && current.portableModifiedAt === expected.portableModifiedAt;
    } catch {
      return false;
    }
  }
}
