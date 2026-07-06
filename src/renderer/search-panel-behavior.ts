export const SEARCH_RESULT_OPTION_ATTRIBUTE = "data-search-result-index";

export type SearchableAppIdentity = {
  id: string;
  name: string;
  groupId: string;
  processName: string;
  executablePath?: string;
  metrics?: unknown;
};

export function buildSearchableAppIdentityKey(apps: SearchableAppIdentity[]) {
  return apps
    .map((app) => [app.id, app.groupId, app.name, app.processName, app.executablePath ?? ""].join("\u001f"))
    .sort()
    .join("\u001e");
}

export function getSearchResultOptionSelector(index: number) {
  return `[${SEARCH_RESULT_OPTION_ATTRIBUTE}="${index}"]`;
}

export function scrollSelectedSearchResultIntoView(root: HTMLElement | null, selectedIndex: number) {
  const selected = root?.querySelector<HTMLElement>(getSearchResultOptionSelector(selectedIndex));
  selected?.scrollIntoView({ block: "nearest" });
}
