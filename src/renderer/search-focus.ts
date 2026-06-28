export type SearchEscapeAction = "clear-query" | "blur-search" | "ignore";

export function resolveSearchEscapeAction(searchFocused: boolean, query: string): SearchEscapeAction {
  if (!searchFocused) return "ignore";
  return query ? "clear-query" : "blur-search";
}

export function pageFocusSelector(activeSection: string, selectedAppId: string) {
  if (activeSection === "processes") return ".process-table";
  if (activeSection === "settings") return ".settings-page";
  if (selectedAppId) return `[data-app-card-id="${cssEscapeForSelector(selectedAppId)}"] .app-card`;
  return ".app-grid";
}

export function shouldFocusAddedApp(result: { appId?: string; added?: boolean; alreadyAdded?: boolean }) {
  return Boolean(result.appId && (result.added || result.alreadyAdded));
}

function cssEscapeForSelector(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
