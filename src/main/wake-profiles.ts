import type { AppEntry, AppWakeStrategy, ResolvedWakeStrategy } from "../shared/types.js";

export type WakePolicy = {
  profileId: string;
  profileSource: "built-in" | "user" | "default";
  strategy: ResolvedWakeStrategy;
  allowWindowFocus: boolean;
  allowSelfLaunchWake: boolean;
  allowAumidActivation: boolean;
  allowSecondScan: boolean;
  allowHiddenWindowRestore: boolean;
  trayRestoreUnsupported: boolean;
  maxExternalStateChangingActions: 1;
  forbiddenWindowClasses: string[];
  forbiddenTitleKeywords: string[];
};

type WakeProfileMatch = {
  processNames?: string[];
  nameKeywords?: string[];
  pathKeywords?: string[];
  hasAppUserModelId?: boolean;
};

type WakeProfileDefinition = {
  id: string;
  priority: number;
  match: WakeProfileMatch;
  policy: Omit<WakePolicy, "profileId" | "profileSource">;
};

const policy = (
  strategy: ResolvedWakeStrategy,
  overrides: Partial<Omit<WakePolicy, "profileId" | "profileSource" | "strategy">> = {}
): Omit<WakePolicy, "profileId" | "profileSource"> => ({
  strategy,
  allowWindowFocus: true,
  allowSelfLaunchWake: strategy === "self-launch",
  allowAumidActivation: strategy === "aumid",
  allowSecondScan: strategy === "self-launch" || strategy === "aumid",
  allowHiddenWindowRestore: true,
  trayRestoreUnsupported: false,
  maxExternalStateChangingActions: 1,
  forbiddenWindowClasses: [],
  forbiddenTitleKeywords: [],
  ...overrides
});

export const wakeProfiles: readonly WakeProfileDefinition[] = [
  {
    id: "mumu",
    priority: 500,
    match: { processNames: ["MuMuNxMain", "MuMuPlayer"], nameKeywords: ["mumu", "网易模拟器"], pathKeywords: ["mumuplayer"] },
    policy: policy("self-launch", { allowWindowFocus: false, allowSecondScan: false })
  },
  {
    id: "wegame",
    priority: 450,
    match: { processNames: ["wegame"], nameKeywords: ["wegame", "腾讯游戏平台"], pathKeywords: ["wegame"] },
    policy: policy("self-launch", { allowWindowFocus: false, allowSecondScan: false })
  },
  {
    id: "wechat",
    priority: 400,
    match: { processNames: ["Weixin", "WeChat", "WeChatAppEx"], nameKeywords: ["微信", "wechat", "weixin"], pathKeywords: ["xwechat", "weixin", "wechat"] },
    policy: policy("window-only", {
      allowHiddenWindowRestore: false,
      trayRestoreUnsupported: true,
      forbiddenWindowClasses: ["WxTrayIconMessageWindow", "Qt*WxTrayIconMessageWindowClass"],
      forbiddenTitleKeywords: ["WECHAT_AUTH_MESSAGE_WINDOW_RECEIVER"]
    })
  },
  {
    id: "notion",
    priority: 350,
    match: { processNames: ["Notion"], nameKeywords: ["notion"], pathKeywords: ["notion"] },
    policy: policy("window-only", { allowHiddenWindowRestore: false, trayRestoreUnsupported: true })
  },
  {
    id: "codex",
    priority: 300,
    match: { processNames: ["Codex"], nameKeywords: ["codex"], pathKeywords: ["codex"] },
    policy: policy("self-launch")
  },
  {
    id: "windows-store",
    priority: 200,
    match: { hasAppUserModelId: true },
    policy: policy("aumid")
  }
] as const;

const normalizeExecutableName = (value: string) => (value.split(/[\\/]/).pop() ?? value).replace(/\.exe$/i, "").trim().toLocaleLowerCase();
const normalizedValues = (values: (string | undefined)[]) => values.map((value) => value?.trim().toLocaleLowerCase() ?? "").filter(Boolean);

function matchesProfile(app: AppEntry, match: WakeProfileMatch) {
  if (match.hasAppUserModelId && !app.appUserModelId?.trim()) return false;
  const processNames = normalizedValues([app.processName, ...(app.processAliases ?? [])]).map(normalizeExecutableName);
  const searchableName = normalizedValues([app.name, app.processName, ...(app.processAliases ?? [])]).join(" ");
  const searchablePath = app.executablePath.trim().toLocaleLowerCase();
  const processMatch = !match.processNames?.length || match.processNames.some((name) => processNames.includes(normalizeExecutableName(name)));
  const nameMatch = !match.nameKeywords?.length || match.nameKeywords.some((keyword) => searchableName.includes(keyword.toLocaleLowerCase()));
  const pathMatch = !match.pathKeywords?.length || match.pathKeywords.some((keyword) => searchablePath.includes(keyword.toLocaleLowerCase()));
  const hasSpecificMatcher = Boolean(match.processNames?.length || match.nameKeywords?.length || match.pathKeywords?.length);
  return hasSpecificMatcher ? processMatch || nameMatch || pathMatch : true;
}

export function matchWakeProfile(app: AppEntry) {
  return [...wakeProfiles].sort((left, right) => right.priority - left.priority).find((profile) => matchesProfile(app, profile.match));
}

function applyUserStrategy(base: WakePolicy, strategy: AppWakeStrategy): WakePolicy {
  if (strategy === "auto") return base;
  if (strategy === "window-only") {
    return {
      ...base,
      ...policy("window-only"),
      profileSource: "user",
      profileId: base.profileId,
      allowHiddenWindowRestore: base.allowHiddenWindowRestore,
      trayRestoreUnsupported: base.trayRestoreUnsupported
    };
  }
  if (strategy === "self-launch") {
    return { ...base, ...policy("self-launch"), profileSource: "user", profileId: base.profileId };
  }
  return { ...base, ...policy("aumid"), profileSource: "user", profileId: base.profileId };
}

export function resolveWakePolicy(app: AppEntry): WakePolicy {
  const matched = matchWakeProfile(app);
  const base: WakePolicy = matched
    ? { ...matched.policy, profileId: matched.id, profileSource: "built-in" }
    : { ...policy("window-only"), profileId: "default", profileSource: "default" };
  return applyUserStrategy(base, app.wakeStrategy ?? "auto");
}

export function usesWakeProfile(app: AppEntry, profileId: string) {
  return matchWakeProfile(app)?.id === profileId;
}
