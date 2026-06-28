export type SearchResultAction =
  | { kind: "managed"; index: number }
  | { kind: "discovered"; index: number }
  | { kind: "open-file"; index: number }
  | { kind: "none" };

export function resolveSearchResultAction(input: { managedCount: number; discoveredCount: number; fileCount: number; selectedIndex: number }): SearchResultAction {
  const appCount = input.managedCount + input.discoveredCount;
  if (input.selectedIndex < input.managedCount) return { kind: "managed", index: input.selectedIndex };
  if (input.selectedIndex < appCount) return { kind: "discovered", index: input.selectedIndex - input.managedCount };
  if (appCount === 0 && input.selectedIndex < input.fileCount) return { kind: "open-file", index: input.selectedIndex };
  return { kind: "none" };
}
