import type { AppGroup, SectionId } from "../shared/types";

export const ALL_APPS_SECTION_ID = "all-apps";
export const SYSTEM_SECTION_IDS = new Set<SectionId>(["processes", ALL_APPS_SECTION_ID, "settings"]);

export function firstAppGroupId(groups: AppGroup[]) {
  return groups
    .filter((group) => !group.isSystem)
    .sort((a, b) => a.order - b.order)[0]?.id ?? "processes";
}

export function resolveLoadedSection(current: SectionId, groups: AppGroup[]) {
  if (SYSTEM_SECTION_IDS.has(current)) return current;
  return groups.some((group) => group.id === current) ? current : firstAppGroupId(groups);
}
