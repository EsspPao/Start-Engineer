# PROJECT_OPTIMIZATION

本文档基于当前仓库 `D:\Code\Start Engineer` 的真实代码整理，面向后续接手的 AI / 开发者。它不是普通用户说明书，也不是营销介绍；目标是帮助后来者快速理解 Start Engineer 现在做到了什么、核心路径在哪里、哪些地方容易踩坑，以及下一步应该怎样优化。

请以后续实际代码为准，尤其是 `src/shared/types.ts`、`src/main/main.ts`、`src/renderer/main.tsx`、`src/main/window-manager.ts`、`native/window-focus-helper/Program.cs`。本文只把代码中已经存在的能力写为“当前能力”；尚未落地的设想会明确放在“风险 / 建议 / 路线图”中。

最后核对日期：`2026-07-23`。当前开发基线包含 `main@c256366` 之后的合并卡片键盘交互、透明图标提取、快捷方式拖入、右键菜单视口适配、“普通权限主界面 + 会话级高权限进程控制”，以及参照 Wallpaper Glass 统一的其他主题外观；Wallpaper Glass 与 Clear Desktop 自身保持独立、不会被统一覆盖层改写。应用启动兼容自身清单要求管理员权限的程序：普通启动返回 Windows 740 后自动请求 UAC 并重试，取消授权不会误判成路径失效。当前已通过 TypeScript 类型检查、native helper 构建、完整 Vitest 测试（78 个测试文件、331 项测试）、生产构建和 Electron 冒烟验证；Windows 安装版与便携版已同步重新生成到 `release`。

维护硬性约定：每次代码、配置、样式、测试或构建流程发生改动，都必须在同一提交中同步更新本文档，至少记录受影响能力、验证结果或新的维护注意事项，避免文档再次落后于实际代码。

发布硬性约定：每次完成改动并通过必要验证后，都必须重新生成 Windows 安装版和便携版，确保 `release` 中的交付文件与当前代码一致。

## 1. 项目定位与当前状态

Start Engineer 当前是一个 Windows 桌面启动台与进程监控工具，正在从“个人应用分组启动器”演进为“桌面启动台 / 任务栏辅助入口”。项目面向 Windows 10/11，使用 Electron + React + TypeScript 实现，并带有一个 Windows-only C# 窗口聚焦 helper。

当前核心能力：

- 按用户分组管理应用。
- 系统分组包括 `进程`、`已添加应用`、`设置`。
- `已添加应用` 是聚合视图，按 `executablePath` 去重显示全部已添加应用，并保存独立排序。
- 添加、修改、移动、删除应用。
- 支持通过文件选择器、搜索候选、拖入 `.exe` 或 `.lnk` 添加应用。
- 搜索框可搜索已添加应用、本机可添加应用、安全下载入口；没有应用结果时才显示 Everything 文件兜底结果。
- 支持首次启动扫描开始菜单和桌面快捷方式，并提供候选导入。
- 应用卡片支持鼠标和键盘操作：选择、启动、唤起、右键菜单、编辑和拖拽排序。
- 应用右键菜单会在内容或窗口尺寸变化时自动贴合视口边界；长菜单限制在窗口内独立滚动，底部操作不会再落到不可见区域。
- 支持将应用拖到另一个应用或既有多应用卡片中；成员应用从外层网格隐藏，多应用卡片与普通卡片统一排序并可跨分组移动。
- 多应用卡片支持单击或 Enter 原位放大、双击或默认 `Ctrl+Enter` 启动全部成员；成员可从放大卡片拖回外层、转移到其他卡片或移动到其他分组。
- 支持方向键 / WASD 网格导航，Enter 执行普通应用主操作或展开合并卡片，Esc 分层退出。
- 应用内快捷键可以录制、冲突校验、立即生效和恢复全部默认；默认支持相邻分组切换及 `Ctrl+1` 到 `Ctrl+9` 直达前九个用户分组。
- 支持关闭单个应用、一次关闭多应用卡片成员、关闭当前视图或全部运行应用、结束进程页中的进程组。
- 支持进程监控页，默认显示已管理应用，可切换全部进程。
- 支持运行状态识别，运行指标包含 `matchedPids`、`associatedPids`、`matchedProcessNames`、`matchedPaths`。
- 支持同一程序出现在多个用户分组时同步运行绿点。
- 支持原生窗口扫描 / 聚焦 helper，PowerShell 作为 fallback。
- 支持 Codex 这类无交互窗口但可通过重新运行自身安全激活的 allowlist 策略。
- 支持全局快捷键唤出 / 隐藏主窗口。
- 支持开机自启、关闭到托盘、托盘菜单。
- Electron 主界面默认保持普通权限，资源管理器可原生拖入 `.exe` / `.lnk`；需要结束高权限进程时，由受限 native helper 在本次运行中授权一次并保持连接，后续不再反复弹出 UAC。授权失败或取消使用可关闭 Toast，不再永久占用应用页右下角。
- 支持窗口大小和位置记忆。
- 支持 Splash Window，降低双击 EXE 后的空白等待感。
- `Apple Gallery`、`Fluent Workspace`、`Midnight Control`、`Modern Utility`、`Refined Glass` 参照 Wallpaper Glass 共用同一套玻璃外观和交互层级，只保留配色差异；`Wallpaper Glass` 原有背景、按钮与融合强度链路保持不变，`Clear Desktop` 继续作为独立透明主题。
- `Wallpaper Glass` 支持深色/浅色变体和 0-100 数值融合强度，滑条拖动时实时预览。
- 支持受约束 UI 编辑：整体缩放、自定义背景色、卡片大小、网格密度、侧栏宽度、顶部图标大小、背景色调，以及名称/搜索栏/运行状态/底部操作的显示开关。
- 支持 UI 分享码 `seui:v1:...` 导入导出。
- 支持应用卡片拖拽排序、拖到侧栏移动分组，以及设置页分组拖拽排序。

当前验证与打包脚本：

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke`
- `npm run package:win`

`npm run package:win` 会先执行 `scripts/close-running-app.mjs`：同时通过 `tasklist` 和 PowerShell 进程查询识别安装版、便携版及临时目录中的 Start Engineer 实例，优先正常结束，必要时按 PID 强制结束；仍有高权限残留时会请求管理员权限。预检确认程序完全退出后才开始覆盖 `release` 产物，避免打包文件被占用。

当前打包配置：

- 包名：`start-engineer`
- 产品名：`Start Engineer`
- appId：`com.essppao.startengineer`
- 输出目录：`release`
- 安装包：`release/Start-Engineer-Setup-0.1.0.exe`
- 便携版：`release/Start-Engineer-Portable-0.1.0.exe`
- 当前未签名：`signAndEditExecutable: false`
- `electron-builder.extraResources` 会把 `dist-native/window-focus-helper/win-x64` 打进资源目录。

## 2. 设计原则

本章应作为后续功能判断的第一优先级。Start Engineer 不是信息越多越好，也不是功能入口越多越好。它应该是一个轻、快、干净、可靠的桌面启动台。

### 2.1 低文字密度

主界面应优先用视觉状态表达，不要堆文字。

- 运行中：右上角绿色状态灯。
- 关闭运行应用：绿灯 hover / focus 后变为红色 X。
- 启动中：卡片遮罩 + spinner。
- 路径疑似失效：红色警告角标。
- 多应用卡片部分运行：右上角半亮状态灯；全部运行时显示完整绿色状态灯。
- 当前选中：整张卡片高亮；`Clear Desktop` 使用浅色半透明圆角材质。
- 可添加搜索结果：右侧 `+`。
- 已添加搜索结果：右侧 `✓`。

后续新增状态时应遵守：

- 能用灯点、角标、颜色表达的，不写长句。
- 详细解释放 Tooltip、Toast、右键菜单、诊断信息或设置页。
- 主界面不显示完整路径、PID、启动参数、PowerShell 错误堆栈。
- Toast 要短，诊断要可复制，二者不要混在一起。

### 2.2 桌面启动台优先

Start Engineer 的长期方向是“桌面启动台 / 任务栏辅助入口”，但不能默认强制隐藏 Windows 任务栏，也不能偷偷修改系统设置。

这意味着：

- 运行中的应用单击必须尽量唤起已有窗口。
- 未运行应用 Enter / 双击才启动。
- 关闭应用必须是明确危险操作，只能从红色 X、右键菜单或确认弹窗触发。
- 多窗口应用应该优先唤起最近使用或主窗口，右键菜单可承载窗口列表。
- 找不到窗口时只提示，不误唤起 helper / 托盘 / 消息窗口。
- 对 allowlist 内的特殊应用可以做安全激活，但必须明确、可测试、可回退。

### 2.3 轻量优先

启动台首先要“出现得快、操作不粘、后台安静”。当前已有 Splash、启动后延迟刷新图标、进程页后台预热、managed/full 快照分离等优化。后续仍应继续：

- 首屏优先展示应用和分组。
- Everything、图标刷新、进程 full 快照都应延后或后台处理。
- 托盘/隐藏状态下避免高频轮询。
- 不为视觉效果引入持续大面积动画。
- 高频列表中避免昂贵滤镜。

### 2.4 安全可控

Start Engineer 会启动程序、结束进程、申请管理员、下载 Everything 依赖、打开官方软件下载页，这些都属于敏感行为。原则是：

- 用户显式触发。
- 危险操作确认。
- 不静默提升权限。
- 不静默隐藏系统任务栏。
- 不移动用户鼠标。
- 不模拟点击系统托盘图标。
- 不自动下载并安装第三方应用；当前“可安装应用搜索”只打开官方下载页。
- 不把调试脚本细节直接展示给普通用户。

### 2.5 减少首次配置

当前已经实现首次扫描开始菜单和桌面快捷方式候选导入，也支持从搜索框直接添加本机应用。后续应继续减少“手动找 exe”的成本：

- 优化候选去重和分组推荐。
- 对路径失效提供一键重新选择。
- 允许导入后快速清理不需要的应用。
- 安全下载入口只指向官方页面，不做静默安装。

### 2.6 真实能力优先于漂亮假象

窗口唤起、运行状态识别、进程关闭这类能力必须诚实。能做到就做，做不到要给出可诊断失败，而不是：

- 运行中但实际无法唤起时误报成功。
- 找不到窗口就随意重新启动，导致打开第二个实例。
- 微信托盘状态下恢复不稳定却强行弹空白窗口。
- 用鼠标移动/点击托盘来伪造恢复。

### 2.7 键盘优先操作原则

Start Engineer 应尽可能支持键盘操作，让用户可以在不依赖鼠标的情况下完成常用流程。应用的核心目标是减少用户操作成本，因此不仅要减少点击次数，也要让用户能通过方向键、WASD、Enter、Esc、快捷键等方式快速选择、启动、唤起和管理应用。

具体要求：

- 方向键和 WASD 可用于选择应用。
- Enter 启动/唤起普通应用，选中合并卡片时改为展开；启动合并卡片全部成员使用独立可配置快捷键，默认 `Ctrl+Enter`。
- Esc 用于取消、关闭搜索、关闭菜单或关闭弹窗。
- 常用操作尽量提供快捷键。
- 键盘操作不能干扰搜索框、输入框、编辑框等文本输入。
- 主界面保持低文字密度，不要因为快捷键增加大量说明文字。
- 快捷键说明可以放在 Tooltip、帮助页或快捷键面板中。

## 3. 技术栈与架构

### 3.1 技术栈

- Electron 33
- React 18
- TypeScript 5
- Vite 5
- Vitest
- electron-builder
- 原生 CSS 变量主题系统
- C# / .NET 8 Windows helper：`native/window-focus-helper`

当前没有使用：

- Redux / Zustand / MobX
- UI 组件库
- SQLite
- Electron Store
- 自动更新库
- 原生 Node addon

注意：虽然没有 Node native addon，但构建 Windows 产物需要 .NET SDK 来发布 `window-focus-helper.exe`。

### 3.2 主要目录

```txt
D:\Code\Start Engineer
  build\
    icon.ico
    icon.png
    icon.svg
    tray-icon.png
  native\
    window-focus-helper\
      Program.cs
      window-focus-helper.csproj
  scripts\
    build-window-helper.mjs
    dev.mjs
    generate-icons.ps1
    smoke.mjs
  src\
    main\
      main.ts
      config-store.ts
      app-service.ts
      group-service.ts
      launch-service.ts
      runtime-service.ts
      search-service.ts
      preferences-service.ts
      icon-service.ts
      search-dependency-service.ts
      administrator-service.ts
      process-control-service.ts
      app-window-service.ts
      app-addition-service.ts
      focus-hints.ts
      ipc.ts
      runtime-ipc.ts
      search-ipc.ts
      preferences-ipc.ts
      window-ipc.ts
      runtime-monitor.ts
      window-manager.ts
      focus-window.ts
      process-termination.ts
      preferences.ts
      app-discovery.ts
      dropped-apps.ts
      installable-apps.ts
      batch-app-actions.ts
      everything-search.ts
      search-dependencies.ts
      splash-window.ts
      administrator-launch.ts
      user-data-migration.ts
      config-migration.ts
      icon-cache.ts
      native-helper.ts
    preload\
      preload.cts
    renderer\
      main.tsx
      pages.tsx
      keyboard-shortcuts.tsx
      settings-sections.tsx
      search-results-panel.tsx
      app-edit-dialog.tsx
      context-menus.tsx
      overlay-components.tsx
      window-focus-feedback.ts
      group-management.tsx
      settings-page.tsx
      ui-icons.tsx
      use-settings-group-drag.ts
      use-settings-preferences.ts
      use-search-results.ts
      use-executable-drop.ts
      use-unified-grid-drag.ts
      styles.css
      section-apps.ts
      keyboard-navigation.ts
      app-card-interaction.ts
      app-display.ts
      app-drag-order.ts
      card-click.ts
      launch-feedback.ts
      navigation.ts
      search.ts
      search-panel-behavior.ts
      startup-schedule.ts
      theme-attributes.ts
      theme-options.ts
      theme-settings.tsx
    shared\
      types.ts
      theme.ts
      global-shortcut.ts
      ui-layout-share.ts
```

### 3.3 主进程职责

`src/main/main.ts` 仍是主编排入口，六轮服务拆分后已从约 1900 行降到约 335 行，当前主要负责：

- Electron 顶层生命周期注册。
- 服务初始化与跨服务依赖注入。
- 本机应用发现服务的入口编排。
- 首次导入候选扫描。

已拆出的边界：

- `config-store.ts`：统一 JSON 缓存、损坏备份和默认恢复。
- `app-service.ts`：应用配置 CRUD、分组变更和排序。
- `group-service.ts`：分组、多应用卡片和混合网格顺序。
- `launch-service.ts`：启动、已运行判断和子进程关联学习。
- `runtime-service.ts`：managed/full 快照、降级、快速状态和批量终止。
- `search-service.ts`：快捷方式发现、Everything 候选、首次导入和候选添加。
- `preferences-service.ts`：偏好存储、快照、开机启动、全局快捷键和界面分享码。
- `icon-service.ts`：系统图标提取、内存缓存、磁盘缓存和批量刷新。
- `search-dependency-service.ts`：Everything 下载、解压、启动、状态和并发去重。
- `administrator-service.ts`：权限检测、提权交接和按配置重启。
- `process-control-service.ts`：PowerShell 命令执行、普通/提权 taskkill 和关键进程保护。
- `app-window-service.ts`：主窗口、Splash、托盘、主题、边界保存、显示/隐藏和退出状态。
- `app-addition-service.ts`：EXE 文件选择、拖入程序或 Windows 应用快捷方式、重复过滤、图标缓存和新增应用持久化。
- `focus-hints.ts`：窗口聚焦提示的清洗与运行指标转换。
- `ipc.ts`：应用库相关 IPC 注册。
- `runtime-ipc.ts`、`search-ipc.ts`、`preferences-ipc.ts`、`window-ipc.ts`：按职责分区的 IPC 注册器。
- `ipc-contract.test.ts`：校验 preload 调用与主进程处理器一一对应、通道无重复、主到渲染事件不遗漏。

`main.ts` 当前已基本达到 composition root 目标，后续重点应转向渲染入口；主进程只继续做小范围的依赖组装整理，不再为了行数制造细碎服务。

### 3.4 渲染层职责

`src/renderer/main.tsx` 是渲染层组合入口。当前已迁出完整设置页、设置偏好控制器、设置页分组拖拽、搜索请求状态机、外部应用拖入、统一网格拖拽、快捷键设置、搜索结果、应用编辑、右键菜单、通用弹层、分组管理组件和通用图标，但以下职责仍然集中：

- 加载分组、应用、偏好。
- 系统 section 和用户 section 切换。
- 运行快照轮询。
- 进程页后台预热。
- 搜索结果动作与搜索框焦点恢复。
- 键盘导航和焦点恢复。
- 旧聚合视图应用卡片拖拽排序和移动分组。
- 多应用卡片放大和启动反馈；统一网格拖拽、成员迁移和混合排序已迁入独立 hook。
- 应用启动/关闭反馈。
- 主题属性和 UI layout 属性写入 `document.documentElement.dataset`。

`src/renderer/pages.tsx` 包含 `ProcessPage` 和 `GroupPage`。其中进程页使用轻量虚拟列表，分组页负责应用卡片、底部操作栏和卡片交互。

渲染层后续建议拆分：

- `AppShell`
- `Sidebar`
- `TopbarSearch`
- `GroupPage`
- `AllAppsPage` 或聚合视图 hook
- `ProcessPage`
- `SettingsPage`（已完成）
- `SearchPanel`
- `ContextMenus`
- `Dialogs`
- `ImportWizard`
- `useRuntimePolling`
- `useAppActions`

## 4. 数据模型与配置

### 4.1 用户数据目录

当前用户数据目录：

```txt
%APPDATA%\start-engineer
```

Smoke 模式使用临时目录：

```txt
%TEMP%\start-engineer-smoke-{pid}
```

旧目录迁移：

```txt
%APPDATA%\commanddeck-next -> %APPDATA%\start-engineer
```

### 4.2 配置文件

- `apps.json`：应用列表。
- `groups.json`：用户分组。
- `folders.json`：多应用卡片及其成员顺序。
- `group-grid-order.json`：普通应用与多应用卡片的混合网格顺序。
- `preferences.json`：偏好设置。
- `icons\*.png`：应用图标缓存。
- `dependencies\everything\`：自管 Everything / ES 依赖。

配置损坏时，主进程会尝试将损坏文件重命名为 `.corrupt-{timestamp}.bak` 并恢复默认配置。

### 4.3 Section 模型

`src/shared/types.ts` 中：

- `SystemSectionId = "processes" | "all-apps" | "settings"`
- `SectionId = SystemSectionId | string`

当前语义：

- `processes`：进程监控页。
- `all-apps`：系统聚合应用视图，不写入 `groups.json`。
- 用户分组：来自 `groups.json`，可重命名、删除、拖拽排序。
- `settings`：设置页。

注意：

- `all-apps` 不是普通用户分组，但当前实现允许在该视图内拖拽排序，排序保存到 `preferences.allAppsView.orderedAppIds`。
- `all-apps` 会先应用独立排序，再按归一化后的 `executablePath` 去重；同一个 exe 出现在多个用户分组时只显示一个代表卡片。
- 如果 `preferences.allAppsView.orderedAppIds` 指向某个重复副本，该副本会优先作为 `all-apps` 中的显示代表。
- 分组直达快捷键只跳转用户应用分组，不跳系统聚合分组；默认覆盖 `Ctrl+1` 到 `Ctrl+9`，实际绑定读取用户偏好。

### 4.4 AppEntry 当前字段

`AppEntry` 主要字段：

- `id`
- `name`
- `category`
- `groupId`
- `executablePath`
- `processName`
- `accent`
- `iconCachePath`
- `iconDataUrl`
- `iconCacheVersion`
- `iconPixelSize`
- `launchArgs`
- `workingDirectory`
- `launchedPid`
- `processAliases`
- `associatedPids`

注意：

- `associatedPids` 已存在于类型中，但当前代码主要用 `runtimeAssociatedPids` 做运行期关联 PID，避免把复杂启动器的临时子进程永久污染到配置。

### 4.5 AppFolder 与混合网格顺序

- `AppFolder` 保存 `id`、`groupId`、`name`、有序 `appIds` 和 `order`。
- `GroupGridItemId` 使用 `app:<id>` 或 `folder:<id>`，让普通应用与多应用卡片共享同一套排序。
- `GroupGridOrder` 按分组保存混合项目顺序；主进程会清理失效 ID、重复成员和不足两个成员的卡片。
- 多应用卡片跨分组移动时，卡片及全部成员原子迁移；成员移出后只剩一个成员时自动解散。

### 4.6 AppPreferences 当前字段

当前偏好包括：

- `launchAtStartup`
- `closeBehavior`
- `globalShortcutEnabled`
- `globalShortcut`
- `uiTheme`
- `wallpaperGlassIntensity`
- `wallpaperGlassVariant`
- `runAsAdministrator`
- `searchProvider`
- `sortRunningAppsFirst`
- `showAppNames`
- `keyboardShortcuts`
- `uiLayout`
- `allAppsView`
- `firstRunImportCompleted`
- `windowBounds`
- `everythingCliPath`
- `everythingManagedPath`

默认值以 `src/main/preferences.ts` 为准。目前实际默认值：

- `launchAtStartup: false`
- `closeBehavior: "tray"`
- `globalShortcutEnabled: true`
- `globalShortcut: "Ctrl+Shift+Space"`
- `uiTheme: "apple"`
- `wallpaperGlassIntensity: 55`
- `wallpaperGlassVariant: "dark"`
- `runAsAdministrator: false`
- `searchProvider: "everything"`
- `sortRunningAppsFirst: true`
- `showAppNames: false`
- `uiLayout: defaultUiLayoutPreferences`
- `allAppsView: { orderedAppIds: [] }`
- `firstRunImportCompleted: false`

`uiLayout` 当前字段：

- `uiScale: number`，归一化范围 80-125。
- `backgroundColor: string`，为空时使用主题背景，否则为六位十六进制颜色。
- `cardSize: "small" | "medium" | "large"`
- `gridDensity: "compact" | "standard" | "relaxed"`
- `sidebarWidth: "narrow" | "standard" | "wide"`
- `brandIconSize: "standard" | "large"`
- `backgroundTone: "default" | "aurora" | "graphite" | "mist"`
- `showRunningStatus`
- `showAppNames`
- `showBatchActions`
- `showSearchBar`

注意：

- `wallpaperGlassIntensity` 已是 0-100 数值。旧字符串 `"weak" | "medium" | "strong"` 仅作为迁移兼容输入。
- 顶层 `showAppNames` 仍保留用于兼容；实际 UI layout 控制看 `uiLayout.showAppNames`。
- `keyboardShortcuts` 按独立命令保存规范化按键列表；用户录制会完整替换该命令旧绑定，并在保存后立即更新运行时匹配。
- `runAsAdministrator` 为兼容旧配置继续保留，但当前语义已改为“启动时预先授权高权限进程控制”，不再表示让整个 Electron 主界面提权。

## 5. 当前功能实现分析

### 5.1 启动流程、会话级高权限进程控制与 Splash

启动流程重点：

- 启动阶段不再因 `runAsAdministrator` 提升整个 Electron 主界面；GUI 保持普通权限，从根源上保留 Explorer 的 OLE 文件拖放。
- 旧 `runAsAdministrator: true` 自动沿用为“启动时预授权一次”。窗口显示后启动受限的 elevated termination helper；用户取消 UAC 时主界面继续正常工作，拖放不受影响。
- 普通关闭先执行普通 `taskkill`；确认目标 PID 仍在运行后才按需启动 helper。本次运行一旦授权成功，单应用、合并卡片、分组、全部关闭和进程页都复用同一连接。
- helper 的命名管道由普通 GUI 创建；双方校验父 PID、Windows 会话、helper PID、协议版本和 32 字节随机 nonce。高权限端只接受 PID 列表的 `terminate`、`ping` 和 `shutdown`，不接受任意命令、路径或 PowerShell。
- helper 再次拒绝 Start Engineer 自身、进程树祖先、跨会话目标和 Windows 关键进程；GUI 退出或管道断开后 helper 随即退出，避免便携版临时目录被锁定。
- helper 授权取消、启动失败或意外断开时只发送可关闭 Toast，并允许用户稍后重试；应用页不再显示无法消失的永久权限提示。
- `app.whenReady()` 后创建 Splash Window。
- 主窗口先 `show: false` 创建。
- 主窗口 `ready-to-show` 后显示主窗口并销毁 Splash。
- Splash 使用静态 HTML/CSS，不复用 React。
- 主窗口统一使用透明背景和 CSS 玻璃材质，不再按主题切换 Windows Mica；Clear Desktop 通过 CSS 单独移除整屏 blur。
- 窗口 bounds 通过 `windowBounds` 持久化，保存时跳过最小化和全屏状态。

优势：

- 双击 EXE 后更快获得可见反馈。
- 主界面权限与高权限操作能力解耦，拖放和高权限结束进程不再要求用户来回切换并重启。
- 窗口位置记忆使其更适合作为桌面启动台。

风险：

- Electron 真实冷启动仍然偏慢，Splash 只能降低空白感，不能替代启动性能优化。
- 如果未来 Splash 加功能，必须继续保持静态轻量。

### 5.2 应用管理与添加入口

当前支持：

- 添加 `.exe`。
- 搜索本机候选并添加到当前/默认应用分组。
- 拖入 `.exe` 或 `.lnk` 自动添加到当前/默认应用分组。
- 修改启动程序。
- 编辑名称、启动程序和启动参数；历史 `workingDirectory` 字段继续兼容，但当前编辑弹窗不提供独立工作目录控件。
- 移动分组。
- 删除应用。
- 应用卡片拖拽排序。
- 应用拖到侧栏移动分组。
- 高分辨率图标缓存和 fallback 图标；native helper 优先从 EXE 图标资源提取带透明通道的 PNG，缓存版本升级时自动刷新旧图标，避免浅色主题下出现黑色衬底。

本机候选来源：

- 系统开始菜单。
- 用户开始菜单。
- 用户桌面。
- 公共桌面。
- Everything 作为补充候选源。

搜索候选排序会优先保留更像“应用”的结果，例如开始菜单/桌面快捷方式，并降权 helper、updater、uninstall、crashpad、service、renderer、utility 等结果。

拖放添加：

- 渲染层使用 `getPathForFile(file)` 取得真实路径。
- 前端接受 `.exe` 和 `.lnk`；主进程将 `.lnk` 解析为真实 EXE，并保留快捷方式名称、工作目录和启动参数。
- 正常启动时 Electron 主界面保持普通权限，Explorer 拖放会直接到达既有 DOM drop 链路；无需管理员拖放代理，也不再显示永久恢复条。
- 如果用户从外部显式“以管理员身份运行”GUI，Windows UIPI 仍会阻止普通 Explorer 的 OLE 拖放；设置页会准确显示该实际状态，但不会用不可关闭弹窗覆盖应用网格。
- 主进程 `apps:addDroppedExecutables` 最终校验目标路径存在且扩展名为 `.exe`。
- 已存在 executablePath 时跳过，不重复添加。
- 添加后会更新列表、Toast 反馈，并选中新添加应用。

### 5.3 应用卡片交互与键盘导航

当前规则：

- 未运行应用：
  - 单击：选中。
  - 双击 / Enter：启动。
- 运行中应用：
  - 单击：选中并尝试唤起窗口。
  - 双击 / Enter：尝试唤起窗口，不重复启动。
- 启动中应用：
  - 单击：选中。
  - Enter / 双击：轻提示，不重复启动。
- 关闭运行应用：
  - 右上角运行状态灯 hover/focus 后显示红色 X。
  - 点击 X 触发关闭确认。
  - 点击 X 会阻止冒泡，避免触发卡片选择/启动/唤起。
- 多应用卡片：
  - 单击：经过短暂单双击判定后，从原位置平滑放大。
  - Enter：展开卡片，与鼠标单击保持一致；键盘展开后默认选择第一个有效成员。
  - 双击 / 默认 `Ctrl+Enter`：顺序启动全部未运行成员，并跳过已运行成员。
  - 部分运行和全部运行使用不同状态灯；状态灯 hover/focus 后可一次关闭全部运行成员。
  - 启动中、等待运行确认、失败和关闭中均通过成员图标上的统一环形动画或状态反馈表达。
- 应用右键菜单：
  - 初次渲染、异步窗口列表加载和窗口尺寸变化后，使用实际菜单尺寸重新计算位置，横纵方向都保留 8px 视口边距。
  - 菜单高度最多为 `100vh - 16px`，超出时在菜单内部使用滚轮滚动，并阻止滚动继续传递到底层页面。
  - 右键位置靠近窗口底部或右侧时，菜单向上或向左偏移，保证“复制程序路径”“移除应用”等末尾操作可达。

键盘能力：

- 方向键 / WASD 按统一混合网格的几何关系移动选择，普通应用和多应用卡片都可成为当前项。
- Enter 复用普通卡片主操作；选中多应用卡片时只展开，不再直接批量启动。
- “启动卡片全部应用”是独立可配置命令，默认 `Ctrl+Enter`；旧偏好缺少该命令时自动补齐，若默认组合与现有自定义快捷键冲突则使用 `Ctrl+Shift+Enter`。
- 合并卡片展开时，方向键在成员应用之间移动；物理 Esc 在捕获阶段优先收起展开卡片并把选择恢复到外层合并卡片，不受局部控件事件或可配置快捷键匹配影响。
- Esc 关闭浮层、搜索、菜单或取消当前选中。
- Menu 键 / Shift+F10 打开当前应用菜单。
- F2 重命名当前应用。
- 默认 `Ctrl+F` 聚焦搜索框并阻止浏览器默认查找。
- 默认 `Ctrl+W/S`、`Ctrl+ArrowUp/Down` 切换相邻 section。
- 默认 `Ctrl+1` 到 `Ctrl+9` 跳转前九个用户应用分组。
- 所有上述应用内命令都从 `preferences.keyboardShortcuts` 解析；设置页双击按键值即可录制新绑定，保存后立即覆盖旧绑定。

输入保护：

- 焦点在 input、textarea、select、contenteditable 或弹窗输入框中时，WASD 和方向键不控制应用卡片。
- Win/Meta 组合键不触发 Start Engineer 分组切换，避免抢 Windows `Win+Arrow`。

### 5.4 应用启动

主进程优先通过常驻 Windows native helper 的 `CreateProcessW` 启动应用，helper 不可用时才回退到 PowerShell `Start-Process`，支持：

- 可执行文件路径。
- 工作目录。
- 启动参数。
- 启动前路径检查。
- 已运行检测。
- 返回 `launched` / `alreadyRunning` / `cancelled` / `failed`。
- 对内嵌清单要求管理员权限的应用，普通启动收到 Windows 错误 740 后才通过 `ShellExecuteExW + runas` 自动请求 UAC 并重试；PowerShell 回退路径保持同样行为，普通应用不会产生额外授权弹窗。
- 用户取消 UAC 会返回 `cancelled`，界面显示中性取消反馈，不会显示“检查路径和参数”或给卡片添加路径失效标记。

启动后处理：

- 记录启动 PID。
- 立即返回启动请求结果，并在后台等待真实运行状态，避免把进程识别耗时阻塞在点击响应上。
- 渲染层先显示启动中状态，再根据进度事件和运行状态轮询切换到等待、成功或失败；慢启动应用最长保留约 60 秒可见反馈。
- 尝试学习本次启动 PID 派生出的同目录子进程，写入运行期关联 PID。
- 多应用卡片批量启动会逐成员发送进度，折叠卡片和放大视图共享同一状态源。

风险：

- 游戏启动器、客户端更新器、多进程壳仍可能“启动器退出、真实窗口在子进程/其他进程”。
- 关联 PID 只在运行期保留，重启 Start Engineer 后需要重新通过路径/进程名匹配。
- 保持主界面普通权限与资源管理器拖放兼容；禁止通过重新提升整个 Electron 主进程来规避 740，需仅对本次目标应用启动发起授权。

### 5.5 应用窗口唤起

这是当前最关键、最容易回归的能力。

涉及文件：

- `src/main/window-manager.ts`
- `src/main/focus-window.ts`
- `native/window-focus-helper/Program.cs`
- `src/renderer/main.tsx`
- `src/preload/preload.cts`

当前 API：

- `focusAppWindow(id, hints?)`
- `focusAppWindowHandle(id, handle, hints?)`
- `listAppWindows(id, hints?)`
- `getAppWindowDiagnostics(id, hints?)`

当前逻辑：

- 渲染层从卡片运行指标传入 `FocusWindowHints`：
  - `pids`
  - `matchedPids`
  - `associatedPids`
  - `matchedProcessNames`
  - `matchedPaths`
- 主进程优先走 hints 快速路径。
- 使用运行指标和进程快照构造匹配阶段：
  - `matched`
  - `children`
  - `directory`
  - `name`
  - `title`
- 优先调用 C# helper：
  - 开发环境：`dist-native/window-focus-helper/win-x64/window-focus-helper.exe`
  - 打包后：`process.resourcesPath/window-focus-helper/win-x64/window-focus-helper.exe`
- helper 缺失或执行异常时 fallback 到 PowerShell 窗口枚举 / 聚焦脚本。
- 支持缓存最近成功窗口候选。
- 支持 stale request 防串台。
- 支持窗口列表和窗口诊断复制。

C# helper 当前职责：

- `scan`：从 stdin 读取 staged match JSON，返回 `allWindowsScanned`、`relatedWindows`、`filteredWindows`、`finalCandidates`。
- `focus`：读取 `{ handle, expectedPids }`，返回聚焦结果和前台窗口信息。
- 使用 Win32 API 枚举窗口、读取 PID/title/class/path/rect/style、恢复最小化并尝试前台激活。

候选过滤重点：

- 微信 `WxTrayIconMessageWindow` / `Qt*WxTrayIconMessageWindowClass` 不进入最终候选。
- IME、系统 message window、crashpad、Chrome background surface、Electron notify icon host 等非交互窗口会进入 diagnostics 的 `filteredWindows`，但不能聚焦。
- 隐藏空标题 Chromium surface、隐藏 tool window、0x0 owner/IME 类窗口会被过滤。

安全激活：

- `shouldUseSafeActivation(app)` 当前明确排除微信，只对名称/进程/路径/别名里包含 `codex` 的应用启用。
- 如果运行中 app 有 PID 但没有可交互窗口，且在 allowlist 内，会调用 `activateRunningApp(app)` 重新运行该程序，然后等待短暂时间重新扫描窗口并聚焦。
- 该路径不移动鼠标、不点击托盘、不对微信 relaunch。
- 这是为 Codex 托盘态 / 无交互窗口场景做的受控兜底，不是通用托盘恢复。

当前明确约束：

- 不移动用户鼠标。
- 不点击系统托盘。
- 不把疑似 shell/helper/message 窗口当主窗口。
- 微信仍保持安全失败或 `trayRestoreUnsupported` 路径，不做托盘菜单自动恢复。

### 5.6 应用关闭与批量关闭

涉及文件：

- `src/main/process-termination.ts`
- `src/main/batch-app-actions.ts`
- `src/main/main.ts`

当前能力：

- 单应用关闭。
- 多应用卡片成员批量关闭。
- 当前分组及全部已管理运行应用批量关闭。
- 进程页结束进程组。
- 批量 PID 去重。
- 结束多个无关应用时并行执行，减少串行等待。
- 危险进程保护。
- Start Engineer 自身进程保护。
- 普通 `taskkill /T /F` 失败后按需 UAC。
- 管理员 taskkill 后以二次快照为准，不直接把 PowerShell 堆栈暴露给用户。

近期优化点：

- 关闭请求会立即进入“关闭中”视觉状态，并使用主进程返回的实时运行状态继续更新卡片，不必等待下一轮完整快照。
- 关闭前先做轻量 `tasklist` 存活检查，已退出的 PID 不再进入较慢的终止流程。
- 关闭流程仍以真实运行状态为准，不默认“先熄灭再确认后台情况”。

风险：

- 某些应用服务会自动重启。
- 高权限/受保护进程可能仍无法结束。
- 多个卡片指向同一个 exe 时，关闭其中一个会关闭共享进程，刷新后所有重复卡片应同步熄灭。

### 5.7 资源监控

涉及文件：

- `src/main/runtime-monitor.ts`
- `src/main/main.ts`
- `src/renderer/main.tsx`
- `src/renderer/pages.tsx`

当前设计：

- `SnapshotMode = "full" | "managed"`。
- `managed` 通过原生 Toolhelp/Win32 采集已管理应用、已知 PID 及其子进程，只返回应用和指标。
- `full` 通过同一常驻 helper 采集完整进程资源，再返回应用、指标和聚合进程列表。
- 约 800ms TTL。
- single-flight：`full` 不复用 managed-only 采集；managed 可以复用 full。
- 进程页刷新频率高于应用页/设置页。
- 进程页默认 `processFilter = "managed"`，用户可切到全部进程。
- 启动后后台预热一次 full 快照。
- 进程页使用虚拟列表。
- 非托管进程图标异步解析，不阻塞首个 full 结果。

采集来源：

- 常驻 `window-focus-helper.exe runtime` JSON Lines 协议。
- `CreateToolhelp32Snapshot`、`QueryFullProcessImageNameW`、`GetProcessTimes`、`GetProcessMemoryInfo`、`GetProcessIoCounters`。
- helper 缺失、崩溃、超时或协议异常时，才回退到 PowerShell `Get-Process` + CIM `Win32_Process`。

风险：

- helper 故障后的 PowerShell + CIM 回退成本仍高，若频繁出现应优先修 helper，而不是长期运行在回退模式。
- 全进程快照在低性能机器上可能慢。
- 进程路径可能读不到。
- CPU/磁盘速率需要两次采样，首次为 0 属正常。

建议：

- 记录 managed/full 原生采集耗时和 fallback 次数，建立性能基线。
- 保持应用页仅采已管理应用相关 PID，避免功能回归成全量轮询。
- 增加“低功耗监控”或“进程页手动刷新”高级选项。

### 5.8 搜索、添加和 Everything 兜底

涉及文件：

- `src/main/app-discovery.ts`
- `src/main/installable-apps.ts`
- `src/main/everything-search.ts`
- `src/main/search-dependencies.ts`
- `src/renderer/main.tsx`
- `src/renderer/search.ts`
- `src/renderer/search-panel-behavior.ts`

搜索框当前合并多类结果：

- 已添加应用。
- 本机可添加应用。
- 可安装应用安全下载入口。
- 当没有应用类结果时，显示 Everything 文件/文件夹兜底结果。

本机可添加应用：

- 由 `apps:searchCandidates(query)` 提供。
- 来源包括开始菜单、桌面、Everything 补充。
- `.lnk` 会解析 target executable、工作目录、启动参数、图标路径。
- 已添加的 targetPath 不重复添加，结果右侧显示已添加状态。

可安装应用：

- 由 `src/main/installable-apps.ts` 内置小型 catalog 提供。
- 当前只包括有限常见应用，例如微信、Chrome、VS Code、Steam、QQ、Notion、WeGame、Git、PowerToys、Obsidian。
- 操作是 `open-download-page`，只打开官方下载页，不自动下载安装。

Everything 兜底：

- 只有已添加应用、本机可添加应用、可安装应用都没有结果时才显示。
- 文件/文件夹结果仅支持打开，不支持添加到分组。
- Everything 依赖优先用户配置路径，其次 PATH / 常见目录，再次自管目录。
- 可一键下载 Everything 便携版和 ES CLI 到用户数据目录。

重要实现细节：

- 搜索副作用不能依赖运行指标轮询，否则方向键选择会被刷新重置。
- 当前通过“可搜索身份”而不是 runtime metrics 来决定是否重新请求候选。
- 输入新关键词会重置选中项；仅运行状态变化不应重置。

### 5.9 首次应用导入

涉及文件：

- `src/main/app-discovery.ts`
- `src/main/main.ts`
- `src/renderer/main.tsx`

当前能力：

- 首次启动且应用列表为空时，延迟扫描候选。
- 扫描来源包括开始菜单和桌面 `.lnk`。
- 使用 Windows Script Host 解析快捷方式目标。
- 过滤非 `.exe`。
- 排除已存在路径。
- 按名称/路径启发式推荐分组。
- 渲染层显示候选导入面板。
- 导入后写入 apps，并设置 `firstRunImportCompleted: true`。

限制：

- 当前不是全盘扫描。
- 候选分组是启发式，不一定准确。
- 没有复杂软件识别数据库。

### 5.10 主题、Wallpaper Glass、Clear Desktop 与 UI 分享码

当前主题共用规则：

- `apple`、`fluent`、`midnight`、`utility`、`glass` 共用参照 Wallpaper Glass 建立的窗口网格、侧栏与顶栏尺寸、圆角、间距、卡片层级、选中/hover 状态、阴影、半透明表面和 blur 强度。
- 上述五个配色的 Electron 窗口背景统一透明，并禁用按主题启用 Windows Mica 的旧分支，避免同一结构因 OS 材质不同而产生额外外观差异。
- 上述五个配色仅定义 `--theme-shell`、`--theme-panel`、`--theme-card`、`--theme-control` 等颜色材质变量，以及文字、强调色、成功和危险色。
- `prefers-reduced-transparency` 下仍保持统一结构，但使用各配色对应的不透明表面并关闭 blur。
- 统一选择器必须同时排除 `data-theme="wallpaper"` 与 `data-theme="clear"`；Wallpaper Glass 的背景梯度、蓝紫主按钮、深浅变体和 0-100 融合强度继续使用原始专属规则。

当前配色：

- `apple`：Apple Gallery，银白玻璃与克制苹果蓝，也是当前默认主题。
- `fluent`：Fluent Workspace，冷灰蓝玻璃与 Windows 蓝。
- `midnight`：Midnight Control，深墨玻璃与青绿色焦点。
- `utility`：Modern Utility，浅灰绿玻璃与自然绿色。
- `glass`：Refined Glass，雾白青玻璃与松石绿色。
- `wallpaper`：Wallpaper Glass，让桌面壁纸成为视觉主体。
- `clear`：Clear Desktop，参考 TranslucentTB Clear 效果，让桌面壁纸直接透出且不使用整屏模糊。
- `system`：跟随 Windows，浅色映射到冷灰蓝配色，深色映射到墨青配色；结构不会切换。

Wallpaper Glass：

- 深色/浅色变体。
- 0-100 数值融合强度。
- 设置页滑条支持拖动实时预览，提交时保存偏好。
- 使用 `data-theme="wallpaper"`、`data-wallpaper-intensity`、`data-wallpaper-variant` 控制。
- 透明窗口背景。
- 对主要容器使用玻璃变量和 blur。
- `prefers-reduced-transparency` 下回退为更不透明背景。
- 当前只透出 Windows 桌面壁纸，不提供应用内图片选择、图片复制、焦点位置或遮罩编辑；此前试验性自定义壁纸链路已经撤回。
- 其他五个配色借用相同玻璃结构和固定透明材质；深浅变体与 0-100 融合强度控制仍只属于 Wallpaper Glass，统一覆盖层不得重定义其专属变量或按钮样式。

Clear Desktop：

- 使用 `data-theme="clear"`，移除整窗底色和整屏 blur，让 Windows 桌面壁纸直接透出。
- 主要容器仅保留极低透明承载；搜索结果、弹窗和 Toast 等需要稳定可读性的浮层仍使用深色高不透明材质。
- 应用卡片选中、应用卡片 hover 和侧栏当前分组统一为整块浅色半透明圆角高亮，不使用深色选中底、图标组独立高亮、蓝色指示条或侧边强调线。
- `prefers-reduced-transparency` 下回退到不透明深色表面，保证可读性和辅助功能兼容。

受约束 UI 编辑：

- 当前不是任意拖放控件的自由画布，而是保证布局稳定的实时编辑模式。
- 可用滚轮、滑条或步进按钮调整整体 UI 比例（80%-125%），并实时预览。
- 可使用颜色选择器设置自定义背景色，也可恢复主题背景。
- 可调卡片大小、网格密度、侧栏宽度、顶部图标大小、背景色调、显示应用名称、显示搜索栏、显示运行状态、显示底部操作。
- 这些设置写入 `preferences.uiLayout`。

UI 分享码：

- 编码前缀：`seui:v1:`
- 实现文件：`src/shared/ui-layout-share.ts`
- 分享码包含规范化后的 UI layout，包括整体缩放和自定义背景色；不包含应用列表、路径、分组或其他隐私数据。
- 设置页支持生成、复制、粘贴预览和导入；导入成功后立即应用同一套界面配置。
- 导入失败原因包括 `invalid-prefix`、`unsupported-version`、`invalid-payload`。

设计风险：

- 透明窗口和桌面壁纸下，过多 blur 可能影响性能。
- 浅色玻璃在明亮壁纸上可读性更脆弱。
- UI 分享码未来扩展版本时必须保持兼容，不能直接破坏 `seui:v1`。

### 5.11 设置页

当前设置页包含：

- 常规设置折叠面板。
- 快捷键折叠面板。
- 界面主题折叠面板。
- 搜索依赖折叠面板。
- 分组管理。
- 开机启动。
- 关闭行为。
- 全局快捷键。
- 可录制的应用内快捷键和恢复全部默认。
- 启动时预先授权高权限操作；状态区区分正在授权、本次已授权、取消/失败和外部显式提权 GUI。
- 运行应用置顶。
- 实时 UI 编辑、自定义背景色和分享码导入导出。
- 搜索提供方。
- Wallpaper Glass 变体和强度。
- Everything 依赖状态/准备。
- 分组展开查看应用。

已知趋势：

- 设置项已经偏多，继续加功能前应考虑拆成更清晰的“常规 / 外观 / 搜索 / 快捷键 / 高级 / 关于”。

## 6. 当前已知问题与风险

### 6.1 窗口唤起仍是最大风险

虽然已经有 C# helper，窗口唤起仍然是最容易出错的主路径。

原因：

- 不同应用窗口结构差异很大。
- 微信/Notion/Electron/Chromium/游戏启动器可能有多进程、多窗口、托盘隐藏、owner window、无标题窗口。
- Windows 前台切换有系统限制。
- 某些应用关闭到托盘后没有通用恢复 API。

当前最重要原则：

- 找不到就提示。
- 不误聚焦 shell/helper/message/IME 窗口。
- 不移动鼠标。
- 不点击托盘。
- 不把 Codex safe activation 扩大成通用 relaunch。

### 6.2 PowerShell 已降级为故障回退

本节原问题已按三阶段完成主要改造：

- 第一阶段：普通应用启动改用 `CreateProcessW`；管理员启动和管理员 `taskkill` 改用 `ShellExecuteExW`；管理员状态改由 .NET Windows Identity 判断。
- 第二阶段：新增由 Electron 托管的常驻 native runtime helper，使用 JSON Lines 复用进程；应用页的 `managed` 快照只采已管理应用、已知 PID 和子进程。
- 第三阶段：进程页 `full` 快照改用 Win32 完整采集；ZIP 解压改用 `ZipFile`，开始菜单快捷方式改用原生 COM，高分辨率 Shell 图标改由 helper 提取。

当前正常路径不再周期性创建 PowerShell 进程。仍保留 PowerShell 的位置：

- native helper 明确缺失且请求尚未送达时的启动、权限和管理员任务回退。
- 无副作用的进程快照在 helper 崩溃、超时或协议异常时可直接回退；启动请求送达后若响应丢失，不自动二次启动，避免产生重复实例。
- 窗口扫描/聚焦 helper 失败时的兼容回退。
- Shell 图标原生提取失败后的 WPF 回退。
- 快捷方式 COM 解析失败和 ZIP 原生解压失败后的低频回退。

常驻 helper 由 Electron 主进程管理，退出应用时同步结束；请求超时或进程异常退出会拒绝当前请求，下次请求自动重新创建 helper。没有安装 Windows Service，因此安装版和便携版保持一致，也不会额外扩大权限范围。

后续关注点：

- 记录 native/fallback 命中率和快照耗时，确认不同 Windows 版本及安全软件环境下的稳定性。
- 对 helper 协议增加显式版本握手；当前已有 `ping`，但尚未强制校验版本。
- PowerShell fallback 至少保留一个稳定发布周期，再根据真实故障数据决定是否进一步删除。

### 6.3 主进程和渲染入口仍偏大

前六轮结构性拆分已经落地：

- `main.ts` 从约 1900 行降到约 335 行；配置、应用、应用添加、分组、启动、运行时、搜索、搜索依赖、偏好、图标、管理员、进程控制和应用窗口均有独立服务。
- IPC 已按 `library / runtime / search / preferences / window` 分区注册，入口不再直接注册处理器。
- IPC 契约测试会检查 preload 与全部注册器的调用/事件通道，并阻止重复注册。
- `main.tsx` 已迁出完整设置页、偏好编辑、搜索请求、外部应用拖入和统一网格拖拽等控制器，当前约 1478 行；相较本轮开始约 1835 行进一步减少约 19%。

剩余风险：

- `main.ts` 已只保留顶层 Electron 生命周期、服务组装和 IPC 注册器调用，主进程拆分目标基本达成。
- `main.tsx` 当前主要剩余运行快照轮询、启动/关闭应用动作、键盘导航和旧聚合视图拖拽；下一轮应优先提取 `useRuntimePolling` 与 `useAppActions`，不再继续拆分已经稳定的设置页。
- 服务之间目前使用构造参数和闭包注入，后续新增跨服务能力时应避免重新直接导入全局状态。

### 6.4 默认偏好与产品决策存在差异

owner 曾讨论过更强的启动台定位，但当前代码默认仍是：

- `launchAtStartup: false`
- `closeBehavior: "tray"`
- `runAsAdministrator: false`

这不是 bug，但后续公开发布前要重新确认默认值。

### 6.5 正式发布能力不足

当前尚未实现：

- 自动更新。
- 代码签名。
- 崩溃上报。
- 关于页。
- 完整新手引导。
- 发布说明自动化。
- 卸载时用户数据策略说明。

## 7. 高优先级优化建议

### 7.1 窗口唤起继续收敛

当前 native helper 已落地第一版。下一步不应再做“自动点击托盘”类方案，而应继续收敛到可验证策略：

- 为 safe activation 建立 per-app 策略，而不是只靠 `haystack.includes("codex")`。
- 每个特殊应用策略必须明确：
  - 是否允许重新运行自身。
  - 是否允许等待后重扫窗口。
  - 是否禁止某些 className/title。
  - 失败时给什么 reason。
- 把窗口诊断导出成 JSON，便于 AI / 开发者分析。
- 扩展 helper 的测试覆盖，尤其是过滤规则、评分、焦点结果映射。

涉及：

- `src/main/window-manager.ts`
- `src/main/focus-window.ts`
- `native/window-focus-helper/Program.cs`
- `src/shared/types.ts`

### 7.2 进程监控降负载

目标：降低全进程采集成本。

建议：

- 应用页只采 managed app 相关进程。
- 进程页首次显示使用后台预热结果。
- 增加低功耗模式。
- 评估长期运行采集 helper。

涉及：

- `src/main/runtime-monitor.ts`
- `src/main/main.ts`
- `src/renderer/startup-schedule.ts`

### 7.3 拆分主进程服务

目标：降低回归风险。

已完成：

- `config-store.ts`
- `app-service.ts`
- `group-service.ts`
- `launch-service.ts`
- `runtime-service.ts`
- `search-service.ts`
- `preferences-service.ts`
- `icon-service.ts`
- `search-dependency-service.ts`
- `administrator-service.ts`
- `ipc.ts`
- `runtime-ipc.ts`
- `search-ipc.ts`
- `preferences-ipc.ts`
- `window-ipc.ts`

现有 `window-manager.ts` 继续处理外部应用窗口，`app-window-service.ts` 负责 Start Engineer 自身窗口，两者职责已分开。

本轮完成：

- 已增加 IPC 契约测试，避免重复注册和遗漏 preload 契约。
- 已将窗口、托盘、主题和边界保存迁入 `app-window-service.ts`。
- 已将 taskkill/native helper/PowerShell 提权终止适配迁入 `process-control-service.ts`。
- `main.ts` 当前仅保留 Electron 顶层生命周期、服务创建和 IPC 注册器调用。

下一轮建议：

- 应用添加、拖入程序和 EXE 文件选择已迁入 `app-addition-service.ts`。
- 设置页分组排序与跨组拖拽已迁入 `use-settings-group-drag.ts`。
- 完整设置页及偏好编辑已迁入 `settings-page.tsx` 与 `use-settings-preferences.ts`。
- 搜索请求、外部应用拖入和统一网格拖拽分别迁入独立 hook，并由边界测试防止职责回流。
- 下一步优先拆分运行快照轮询和应用启动/关闭动作；旧聚合视图拖拽在移除旧视图时一并删除，不与统一网格状态机强行合并。

### 7.4 设置页信息架构重整

目标：避免设置页继续膨胀。

建议：

- 拆成分类导航。
- 高级功能默认折叠。
- 说明文字迁移到 Tooltip。
- 增加“关于/诊断”页。

### 7.5 错误模型统一

目标：让 Toast、弹窗、诊断信息各司其职。

建议：

- 定义统一错误码。
- 用户短文案和开发诊断分离。
- Toast 不展示 PowerShell 堆栈。
- 诊断信息可复制为 Markdown 或 JSON。

## 8. 中优先级优化建议

- 内部搜索支持拼音/首字母。
- 搜索框显示当前搜索模式并支持快速切换。
- 扩展可安装应用 catalog，但保持官方来源和安全边界。
- 路径失效做启动前批量检测。
- 应用详情抽屉显示路径、参数、匹配 PID、窗口诊断。
- 配置导入/导出。
- 图标缓存清理。
- About 页面显示版本、数据目录、依赖状态。
- 首次导入候选增加更好去重和推荐排序。
- 多窗口应用右键菜单支持直接切换到具体窗口。
- UI 分享码版本化扩展，例如支持更多受约束布局项，但不要夹带本地隐私路径。

## 9. 低优先级 / 未来发布项

- 自动更新。
- 代码签名。
- 崩溃上报。
- 系统通知。
- 多套启动方案。
- 游戏账号/启动参数模板。
- 多用户配置。
- 更完整的官方应用下载索引。
- 临时隐藏任务栏高级功能。

临时隐藏任务栏如果未来实现，必须默认关闭，并满足：

- 开启前明确确认。
- 退出时恢复。
- 托盘菜单提供恢复入口。
- 全局快捷键可恢复。
- 崩溃后下次启动自动恢复。
- 支持多显示器。
- 不允许静默隐藏。

## 10. 建议路线图

### 阶段一：把桌面启动台体验打稳

- 继续修复并加速窗口唤起。
- 完善 safe activation 策略配置。
- 支持多窗口列表。
- 增强窗口诊断。
- 不可靠托盘恢复保持安全失败。
- 保持卡片低文字密度。

### 阶段二：降低后台成本

- 优化进程采集。
- 管理后台轮询。
- 拆分 runtime monitor。
- 建立性能基准。

### 阶段三：优化首次体验

- 完善首次导入 UI。
- 增加推荐分组和候选清理。
- 路径失效引导重新选择。
- 增加“打开数据目录 / 复制诊断 / 关于”。

### 阶段四：准备公开发布

- 明确默认偏好。
- 增加自动更新。
- 配置代码签名。
- 完善安装版/便携版发布策略。
- 写面向用户的 README、FAQ、隐私说明和发布说明。

## 11. 接手者注意事项

- 不要把旧文档中的“计划态”直接当作当前事实，先看 `src/shared/types.ts` 和实际 IPC。
- 修改窗口唤起时务必跑 `focus-window.test.ts`、`window-manager.test.ts` 和 helper 相关测试。
- 修改卡片交互时务必跑 `pages.test.ts`、`app-card-interaction.test.ts`、`card-click.test.ts`、`keyboard-navigation.test.ts`。
- 修改运行识别时务必跑 `runtime-monitor.test.ts`、`batch-app-actions.test.ts`。
- 修改搜索时要关注 `search-panel`、Everything fallback、候选添加、方向键选中不被 runtime 刷新重置。
- 修改 `all-apps` 时要同时检查：
  - 普通用户分组排序。
  - `executablePath` 去重是否仍保留用户拖拽排序指定的代表副本。
  - `preferences.allAppsView.orderedAppIds`。
  - 关闭全部与实时运行状态是否一致。
- 修改多应用卡片时要同时检查：
  - `folders.json` 和 `group-grid-order.json` 的归一化。
  - 普通应用与多应用卡片的混合排序及跨分组移动。
  - 成员拖出、转移、自动解散和重复成员清理。
  - 单击/Enter 放大、双击/默认 `Ctrl+Enter` 批量启动、部分运行状态和批量关闭。
- 修改偏好时同步：
  - `src/main/preferences.ts`
  - `src/shared/types.ts`
  - `src/shared/ui-layout-share.ts`（如果涉及 UI layout）
  - `src/renderer/main.tsx` 的 fallback API
  - 相关测试
- 修改主题时同步：
  - `src/shared/theme.ts`
  - `src/renderer/theme-attributes.ts`
  - `src/renderer/theme-options.ts`
  - `src/renderer/theme-settings.tsx`
  - `src/renderer/styles.css`
  - `PROJECT_OPTIMIZATION.md`
- 修改 IPC 时同步：
  - `src/shared/types.ts`
  - `src/preload/preload.cts`
  - `src/main/main.ts`
  - 渲染层调用点
- 修改 native helper 时同步：
  - `native/window-focus-helper/Program.cs`
  - `src/main/focus-window.ts`
  - `scripts/build-window-helper.mjs`
  - `package.json` 的 build/package 产物
- 每次代码改动后按项目当前约定至少执行：
  - 同步更新 `PROJECT_OPTIMIZATION.md`，记录本次能力、风险或验证基线变化。
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run smoke`
  - `npm run package:win`

## 12. 关键文件索引

- `D:\Code\Start Engineer\package.json`
  - 脚本、依赖、electron-builder 配置、helper 资源、产品名和打包产物命名。
- `D:\Code\Start Engineer\native\window-focus-helper\Program.cs`
  - Windows 窗口扫描/聚焦、原生启动、权限检测、进程采集、快捷方式、图标和解压命令。
- `D:\Code\Start Engineer\scripts\build-window-helper.mjs`
  - `dotnet publish` helper 到 `dist-native/window-focus-helper/win-x64`。
- `D:\Code\Start Engineer\src\shared\types.ts`
  - 应用、分组、多应用卡片、混合网格、偏好、运行快照、搜索、批量操作和 preload API 类型。
- `D:\Code\Start Engineer\src\shared\ui-layout-share.ts`
  - UI layout 默认值、缩放与背景色归一化、分享码编码/解码。
- `D:\Code\Start Engineer\src\main\main.ts`
  - Electron 生命周期、窗口创建、服务装配、进程终止适配和应用添加编排。
- `D:\Code\Start Engineer\src\main\config-store.ts`
  - JSON 配置缓存、规范化、损坏备份和默认恢复。
- `D:\Code\Start Engineer\src\main\app-service.ts`
  - 应用配置读写、编辑、分组迁移、排序和删除。
- `D:\Code\Start Engineer\src\main\group-service.ts`
  - 用户分组、多应用卡片、成员迁移和混合网格顺序。
- `D:\Code\Start Engineer\src\main\launch-service.ts`
  - 原生应用启动、PowerShell 回退、运行判断和启动后进程关联。
- `D:\Code\Start Engineer\src\main\runtime-service.ts`
  - managed/full 采集、RuntimeMonitor 装配、快速状态与批量终止。
- `D:\Code\Start Engineer\src\main\search-service.ts`
  - 本机快捷方式、Everything 候选、首次导入和候选添加。
- `D:\Code\Start Engineer\src\main\preferences-service.ts`
  - 偏好存储、有效状态快照、开机启动、全局快捷键和界面分享码。
- `D:\Code\Start Engineer\src\main\icon-service.ts`
  - 系统图标提取、进程图标缓存、应用图标磁盘缓存和刷新。
- `D:\Code\Start Engineer\src\main\search-dependency-service.ts`
  - Everything 搜索依赖状态、下载、解压、启动、失败清理和并发去重。
- `D:\Code\Start Engineer\src\main\administrator-service.ts`
  - 实际 GUI 权限检测和旧版权限重启兼容代码；正常启动流程不再用它提升 Electron 主界面。
- `D:\Code\Start Engineer\src\main\elevated-termination-host.ts`
  - 普通权限命名管道 server、UAC 启动握手、会话级 helper 状态、受限 PID 终止请求和退出清理。
- `D:\Code\Start Engineer\src\main\ipc.ts`
  - 应用库相关 IPC 注册。
- `D:\Code\Start Engineer\src\main\runtime-ipc.ts`、`search-ipc.ts`、`preferences-ipc.ts`、`window-ipc.ts`
  - 运行时、搜索、偏好和窗口相关 IPC 注册。
- `D:\Code\Start Engineer\src\main\runtime-monitor.ts`
  - 进程采集结果聚合、应用匹配、运行指标、进程页数据。
- `D:\Code\Start Engineer\src\main\window-manager.ts`
  - 应用窗口唤起、窗口列表、诊断信息、safe activation。
- `D:\Code\Start Engineer\src\main\focus-window.ts`
  - helper runner、PowerShell fallback、窗口阶段构造和聚焦 API。
- `D:\Code\Start Engineer\src\main\process-termination.ts`
  - 普通 taskkill、剩余 PID 校验、会话级高权限终止和关闭后复核。
- `D:\Code\Start Engineer\src\main\native-helper.ts`
  - native helper 路径解析、单次命令、常驻 JSON Lines 客户端、超时重启和结果归一化。
- `D:\Code\Start Engineer\src\main\app-discovery.ts`
  - 首次导入候选和搜索可添加本机应用候选。
- `D:\Code\Start Engineer\src\main\dropped-apps.ts`
  - 拖入 `.exe` 或 Windows `.lnk` 应用快捷方式的主进程解析和添加逻辑。
- `D:\Code\Start Engineer\src\main\installable-apps.ts`
  - 可安装应用官方下载入口 catalog。
- `D:\Code\Start Engineer\src\main\everything-search.ts`
  - ES.exe 搜索参数和 CSV 解析。
- `D:\Code\Start Engineer\src\main\search-dependencies.ts`
  - Everything / ES 自管依赖检测、下载和解压。
- `D:\Code\Start Engineer\src\main\preferences.ts`
  - 默认偏好和偏好归一化。
- `D:\Code\Start Engineer\src\main\splash-window.ts`
  - Splash Window 静态页面和生命周期辅助。
- `D:\Code\Start Engineer\src\preload\preload.cts`
  - `window.startEngineer` 暴露层，保留 `window.commandDeck` 兼容别名。
- `D:\Code\Start Engineer\src\renderer\main.tsx`
  - 渲染层状态、轮询、搜索、菜单、设置、导入、拖拽和操作反馈。
- `D:\Code\Start Engineer\src\renderer\context-menus.tsx`
  - 进程、应用和分组右键菜单，以及基于实际尺寸的视口边界定位。
- `D:\Code\Start Engineer\src\renderer\section-apps.ts`
  - 普通分组和 `all-apps` 聚合视图的应用列表、去重和排序辅助。
- `D:\Code\Start Engineer\src\renderer\keyboard-navigation.ts`
  - 应用网格键盘导航、按键规范化和可配置命令匹配辅助。
- `D:\Code\Start Engineer\src\renderer\pages.tsx`
  - 进程页和分组页组件。
- `D:\Code\Start Engineer\src\renderer\styles.css`
  - 全局布局、应用/多应用卡片、启动关闭反馈、设置页、多主题、Wallpaper Glass、Clear Desktop 和 UI 编辑样式。
- `D:\Code\Start Engineer\src\renderer\startup-schedule.ts`
  - 启动后延迟任务和进程页预热时机。
- `D:\Code\Start Engineer\scripts\smoke.mjs`
  - 生产构建烟测。

## 13. 当前结论

Start Engineer 已经不只是一个简单启动器。当前代码已经具备应用分组、多应用卡片与混合网格、聚合应用视图、首次导入、搜索添加、拖放添加、可安装应用安全入口、运行监控、实时批量操作反馈、Everything 兜底搜索、托盘、可配置应用内快捷键、全局快捷键、会话级高权限进程控制、Splash、实时 UI 编辑、UI 分享码、统一 Wallpaper Glass 外观的多套配色、独立 Clear Desktop、native 窗口 helper 和窗口唤起诊断等较完整的桌面应用能力。

下一阶段最重要的不是继续堆新入口，而是把“运行中应用单击唤起窗口”这条主路径做稳、做快，并降低后台监控成本。只要窗口唤起、运行识别和关闭反馈可靠，Start Engineer 才能真正承担“桌面启动台 / 任务栏辅助入口”的角色。随后再拆分大型控制器、整理设置页信息架构、补齐发布能力，项目会明显更接近可公开发布的状态。
