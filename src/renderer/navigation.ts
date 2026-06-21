import type { AppGroup, SectionId } from "../shared/types";

export function firstAppGroupId(groups: AppGroup[]) {
  return groups
    .filter((group) => !group.isSystem)
    .sort((a, b) => a.order - b.order)[0]?.id ?? "processes";
}

export function resolveLoadedSection(current: SectionId, groups: AppGroup[]) {
  return groups.some((group) => group.id === current) ? current : firstAppGroupId(groups);
}
