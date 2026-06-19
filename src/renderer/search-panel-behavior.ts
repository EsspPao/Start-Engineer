export const SEARCH_RESULT_OPTION_ATTRIBUTE = "data-search-result-index";

export function getSearchResultOptionSelector(index: number) {
  return `[${SEARCH_RESULT_OPTION_ATTRIBUTE}="${index}"]`;
}

export function scrollSelectedSearchResultIntoView(root: HTMLElement | null, selectedIndex: number) {
  const selected = root?.querySelector<HTMLElement>(getSearchResultOptionSelector(selectedIndex));
  selected?.scrollIntoView({ block: "nearest" });
}
