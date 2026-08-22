import type { AppInfo } from "../shared/types";

export function formatAppDiagnostics(info: AppInfo) {
  const startup = info.startupDiagnostics?.current.map((marker) => `${marker.name}=${marker.elapsedMs}ms`).join(", ");
  const previousStartup = info.startupDiagnostics?.previous.map((marker) => `${marker.name}=${marker.elapsedMs}ms`).join(", ");
  const runtime = info.runtimeDiagnostics;
  return [
    `Start Engineer ${info.version}`,
    `Windows: ${info.systemVersion} (${info.arch})`,
    `Electron: ${info.electronVersion}`,
    `Chrome: ${info.chromeVersion}`,
    `Node.js: ${info.nodeVersion}`,
    `Packaged: ${info.isPackaged ? "yes" : "no"}`,
    `Data directory: ${info.userDataPath}`,
    startup ? `Startup (current): ${startup}` : "",
    previousStartup ? `Startup (previous): ${previousStartup}` : "",
    runtime ? `Runtime requests: managed=${runtime.requests.managed}, full=${runtime.requests.full}, cache=${runtime.cacheHits}, single-flight=${runtime.singleFlightReuses}` : "",
    runtime ? `Runtime collections: managed=${runtime.collections.managed} (${runtime.averageCollectionMs.managed}ms avg), full=${runtime.collections.full} (${runtime.averageCollectionMs.full}ms avg), native=${runtime.nativeRequests}, fallback=${runtime.fallbackRequests}` : ""
  ].filter(Boolean).join("\n");
}
