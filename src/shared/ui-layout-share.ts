import type { UiBackgroundTone, UiBrandIconSize, UiCardSize, UiGridDensity, UiLayoutPreferences, UiSidebarWidth } from "./types.js";

export type UiLayoutShareDecodeResult =
  | { ok: true; preferences: UiLayoutPreferences }
  | { ok: false; reason: "invalid-prefix" | "unsupported-version" | "invalid-payload" };

export const defaultUiLayoutPreferences: UiLayoutPreferences = {
  cardSize: "medium",
  gridDensity: "standard",
  sidebarWidth: "standard",
  brandIconSize: "standard",
  backgroundTone: "default",
  showRunningStatus: true,
  showAppNames: false,
  showBatchActions: true,
  showSearchBar: true
};

const sharePrefix = "seui:v1:";
const supportedVersions = new Set(["v1"]);
const cardSizes = new Set<UiCardSize>(["small", "medium", "large"]);
const gridDensities = new Set<UiGridDensity>(["compact", "standard", "relaxed"]);
const sidebarWidths = new Set<UiSidebarWidth>(["narrow", "standard", "wide"]);
const brandIconSizes = new Set<UiBrandIconSize>(["standard", "large"]);
const backgroundTones = new Set<UiBackgroundTone>(["default", "aurora", "graphite", "mist"]);

function pickSetValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? value as T : fallback;
}

export function normalizeUiLayoutPreferences(raw: Partial<UiLayoutPreferences> | null | undefined): UiLayoutPreferences {
  return {
    cardSize: pickSetValue(raw?.cardSize, cardSizes, defaultUiLayoutPreferences.cardSize),
    gridDensity: pickSetValue(raw?.gridDensity, gridDensities, defaultUiLayoutPreferences.gridDensity),
    sidebarWidth: pickSetValue(raw?.sidebarWidth, sidebarWidths, defaultUiLayoutPreferences.sidebarWidth),
    brandIconSize: pickSetValue(raw?.brandIconSize, brandIconSizes, defaultUiLayoutPreferences.brandIconSize),
    backgroundTone: pickSetValue(raw?.backgroundTone, backgroundTones, defaultUiLayoutPreferences.backgroundTone),
    showRunningStatus: raw?.showRunningStatus !== false,
    showAppNames: raw?.showAppNames === true,
    showBatchActions: raw?.showBatchActions !== false,
    showSearchBar: raw?.showSearchBar !== false
  };
}

function encodeBase64Url(value: string) {
  return btoa(encodeURIComponent(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(atob(padded));
}

export function encodeUiLayoutShareCode(input: Partial<UiLayoutPreferences>) {
  const preferences = normalizeUiLayoutPreferences(input);
  return `${sharePrefix}${encodeBase64Url(JSON.stringify(preferences))}`;
}

export function decodeUiLayoutShareCode(code: string): UiLayoutShareDecodeResult {
  if (!code.startsWith("seui:")) return { ok: false, reason: "invalid-prefix" };
  const [, version, payload] = code.split(":");
  if (!supportedVersions.has(version)) return { ok: false, reason: "unsupported-version" };
  if (!payload) return { ok: false, reason: "invalid-payload" };
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<UiLayoutPreferences>;
    return { ok: true, preferences: normalizeUiLayoutPreferences(parsed) };
  } catch {
    return { ok: false, reason: "invalid-payload" };
  }
}
