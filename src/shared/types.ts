export type SystemSectionId = "processes" | "settings";
export type SectionId = SystemSectionId | string;

export type AppEntry = {
  id: string;
  name: string;
  category: string;
  groupId: string;
  executablePath: string;
  processName: string;
  accent: string;
  iconCachePath?: string;
  iconDataUrl?: string;
  iconCacheVersion?: number;
  iconPixelSize?: number;
  launchArgs?: string;
  workingDirectory?: string;
  launchedPid?: number;
};

export type AppGroup = {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  order: number;
};

export type GroupInput = { name: string; icon: string };
export type GroupUpdateInput = GroupInput & { id: string };
export type RemoveGroupResult = { groups: AppGroup[]; apps: AppEntry[]; targetGroupId: string };

export type AppMetrics = {
  appId: string;
  isRunning: boolean;
  cpuPercent: number;
  memoryBytes: number;
  diskBytesPerSecond: number;
  pids: number[];
  lastSeenPath?: string;
};

export type ProcessInfo = {
  pid: number;
  pids: number[];
  processCount: number;
  name: string;
  exePath?: string;
  exePaths: string[];
  iconDataUrl?: string;
  cpuPercent: number;
  memoryBytes: number;
  diskBytesPerSecond: number;
  isManagedApp: boolean;
  canTerminate: boolean;
  terminationBlockedReason?: string;
};

export type AppWithMetrics = AppEntry & {
  metrics: AppMetrics;
};

export type UpdateAppInput = Partial<Omit<AppEntry, "id">> & {
  id: string;
};

export type WindowAction = "minimize" | "maximize" | "close";
export type SnapshotMode = "full" | "managed";
export type RuntimeSnapshot = { apps: AppEntry[]; metrics: AppMetrics[]; processes: ProcessInfo[] };

export type LaunchAppResult = {
  status: "launched" | "alreadyRunning" | "cancelled" | "failed";
  apps: AppEntry[];
  pid?: number;
  errorCode?: number;
  message?: string;
};

export type CommandDeckApi = {
  listGroups: () => Promise<AppGroup[]>;
  createGroup: (input: GroupInput) => Promise<AppGroup[]>;
  updateGroup: (input: GroupUpdateInput) => Promise<AppGroup[]>;
  reorderGroups: (groupIds: string[]) => Promise<AppGroup[]>;
  removeGroup: (groupId: string, targetGroupId: string) => Promise<RemoveGroupResult>;
  listApps: () => Promise<AppEntry[]>;
  refreshAppIcons: () => Promise<AppEntry[]>;
  addAppFromDialog: (groupId?: AppEntry["groupId"]) => Promise<AppEntry[]>;
  pickExecutable: (id: string) => Promise<AppEntry[]>;
  updateApp: (input: UpdateAppInput) => Promise<AppEntry[]>;
  setAppGroup: (id: string, groupId: AppEntry["groupId"]) => Promise<AppEntry[]>;
  launchApp: (id: string) => Promise<LaunchAppResult>;
  killApp: (id: string) => Promise<AppEntry[]>;
  removeApp: (id: string) => Promise<AppEntry[]>;
  killProcessGroup: (input: { name: string; pids: number[] }) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<void>;
  getMetricsSnapshot: () => Promise<AppMetrics[]>;
  getProcessSnapshot: () => Promise<ProcessInfo[]>;
  getRuntimeSnapshot: (mode?: SnapshotMode, force?: boolean) => Promise<RuntimeSnapshot>;
  windowAction: (action: WindowAction) => Promise<void>;
};
