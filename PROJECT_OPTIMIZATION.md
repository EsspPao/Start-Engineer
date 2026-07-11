# PROJECT_OPTIMIZATION

本文档基于当前仓库 `D:\Code\Start Engineer` 的真实代码整理，面向后续接手的 AI / 开发者。它不是普通用户说明书，也不是营销介绍；目标是帮助后来者快速理解 Start Engineer 现在做到了什么、核心路径在哪里、哪些地方容易踩坑，以及下一步应该怎样优化。

请以后续实际代码为准，尤其是 `src/shared/types.ts`、`src/main/main.ts`、`src/renderer/main.tsx`、`src/main/window-manager.ts`、`native/window-focus-helper/Program.cs`。本文只把代码中已经存在的能力写为“当前能力”；尚未落地的设想会明确放在“风险 / 建议 / 路线图”中。

## 1. 项目定位与当前状态

Start Engineer 当前是一个 Windows 桌面启动台与进程监控工具，正在从“个人应用分组启动器”演进为“桌面启动台 / 任务栏辅助入口”。项目面向 Windows 10/11，使用 Electron + React + TypeScript 实现，并带有一个 Windows-only C# 窗口聚焦 helper。

当前核心能力：

- 按用户分组管理应用。
- 系统分组包括 `进程`、`已添加应用`、`设置`。
- `已添加应用` 是聚合视图，按 `executablePath` 去重显示全部已添加应用，并有独立排序和独立一键启动勾选状态。
- 添加、修改、移动、删除应用。
- 支持通过文件选择器、搜索候选、拖入 `.exe` 添加应用。
- 搜索框可搜索已添加应用、本机可添加应用、安全下载入口；没有应用结果时才显示 Everything 文件兜底结果。
- 支持首次启动扫描开始菜单和桌面快捷方式，并提供候选导入。
- 应用卡片支持鼠标和键盘操作：选择、启动、唤起、右键菜单、重命名、一键启动勾选。
- 支持方向键 / WASD 网格导航，Enter 执行主操作，Space 切换一键启动勾选，Esc 分层退出。
- 支持 `Ctrl+W/S`、`Ctrl+ArrowUp/Down` 相邻切换分组，`Ctrl+1/2/3` 直达第 1/2/3 个用户应用分组。
- 支持一键启动当前视图中勾选的应用。
- 支持关闭单个应用、关闭当前视图运行应用、结束进程页中的进程组。
- 支持进程监控页，默认显示已管理应用，可切换全部进程。
- 支持运行状态识别，运行指标包含 `matchedPids`、`associatedPids`、`matchedProcessNames`、`matchedPaths`。
- 支持同一程序出现在多个用户分组时同步运行绿点。
- 支持原生窗口扫描 / 聚焦 helper，PowerShell 作为 fallback。
- 支持 Codex 这类无交互窗口但可通过重新运行自身安全激活的 allowlist 策略。
- 支持全局快捷键唤出 / 隐藏主窗口。
- 支持开机自启、关闭到托盘、托盘菜单。
- 支持可选管理员模式和按目标权限重启；冷启动 UAC 拒绝时不继续普通启动。
- 支持窗口大小和位置记忆。
- 支持 Splash Window，降低双击 EXE 后的空白等待感。
- 支持多主题，包括 `Fluent`、`Midnight`、`Modern Utility`、`Refined Glass`、`Wallpaper Glass` 和跟随系统。
- `Wallpaper Glass` 支持深色/浅色变体和 0-100 数值融合强度，滑条拖动时实时预览。
- 支持受约束 UI 编辑：卡片大小、网格密度、侧栏宽度、顶部图标大小、背景色调、是否显示名称/搜索栏/运行状态/批量按钮。
- 支持 UI 分享码 `seui:v1:...` 导入导出。
- 支持应用卡片拖拽排序、拖到侧栏移动分组，以及设置页分组拖拽排序。

当前验证与打包脚本：

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke`
- `npm run package:win`

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
- 一键启动勾选：左上角勾选圆点。
- 当前选中：卡片蓝色高亮。
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
- Enter 执行当前选中应用的主操作。
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
    preload\
      preload.cts
    renderer\
      main.tsx
      pages.tsx
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

`src/main/main.ts` 仍是项目最大编排入口，负责：

- Electron 生命周期。
- Splash Window 和主窗口创建。
- 托盘。
- 自定义窗口控制。
- 配置读写。
- 应用、分组、偏好 IPC。
- 应用启动。
- 应用关闭和批量关闭。
- 进程快照采集。
- Everything 搜索依赖。
- 本机应用发现和搜索候选添加。
- 可安装应用安全下载入口。
- 拖入 `.exe` 添加应用。
- UI 分享码导入导出。
- 全局快捷键。
- 管理员重启。
- 首次导入候选扫描。
- 窗口背景材质和主题联动。

当前虽然已经拆出不少模块，但 `main.ts` 仍然偏大。后续若继续加功能，建议优先拆成 service 层：

- `app-service`
- `group-service`
- `launch-service`
- `window-service`
- `preferences-service`
- `search-service`
- `ipc-register`

### 3.4 渲染层职责

`src/renderer/main.tsx` 是渲染层主控制器，负责：

- 加载分组、应用、偏好。
- 系统 section 和用户 section 切换。
- 首次导入弹层。
- 运行快照轮询。
- 进程页后台预热。
- 搜索框、搜索候选、Everything 兜底和安装入口。
- 键盘导航和焦点恢复。
- 右键菜单。
- 确认弹窗。
- 设置页折叠面板。
- 拖拽排序和移动分组。
- 外部 `.exe` 文件拖放添加。
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
- `SettingsPage`
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
- `all-apps` 内的一键启动勾选独立保存到 `preferences.allAppsView.launchSelectedAppIds`，不会影响同一应用在用户分组里的 `launchSelected`。
- `all-apps` 会先应用独立排序，再按归一化后的 `executablePath` 去重；同一个 exe 出现在多个用户分组时只显示一个代表卡片。
- 如果 `preferences.allAppsView.orderedAppIds` 指向某个重复副本，该副本会优先作为 `all-apps` 中的显示代表。
- `Ctrl+1/2/3` 只跳转用户应用分组，不跳系统聚合分组。

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
- `launchSelected`

注意：

- `associatedPids` 已存在于类型中，但当前代码主要用 `runtimeAssociatedPids` 做运行期关联 PID，避免把复杂启动器的临时子进程永久污染到配置。
- `launchSelected` 是用户分组内的“一键启动勾选”，不等于当前选中卡片。
- `all-apps` 的一键启动勾选不写回 `AppEntry.launchSelected`。

### 4.5 AppPreferences 当前字段

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
- `uiTheme: "utility"`
- `wallpaperGlassIntensity: 55`
- `wallpaperGlassVariant: "dark"`
- `runAsAdministrator: false`
- `searchProvider: "everything"`
- `sortRunningAppsFirst: true`
- `showAppNames: false`
- `uiLayout: defaultUiLayoutPreferences`
- `allAppsView: { orderedAppIds: [], launchSelectedAppIds: [] }`
- `firstRunImportCompleted: false`

`uiLayout` 当前字段：

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

## 5. 当前功能实现分析

### 5.1 启动流程、管理员模式与 Splash

启动流程重点：

- 启动阶段会判断是否需要管理员 relaunch。
- 如果用户配置了管理员启动，冷启动 UAC 被拒绝时，普通权限进程直接退出，不继续启动主窗口。
- 设置页手动“以管理员身份重启”仍保持当前窗口运行，UAC 拒绝时只提示失败/取消。
- `app.whenReady()` 后创建 Splash Window。
- 主窗口先 `show: false` 创建。
- 主窗口 `ready-to-show` 后显示主窗口并销毁 Splash。
- Splash 使用静态 HTML/CSS，不复用 React。
- 主窗口支持透明背景，并按主题设置 Mica 或 none。
- 窗口 bounds 通过 `windowBounds` 持久化，保存时跳过最小化和全屏状态。

优势：

- 双击 EXE 后更快获得可见反馈。
- 管理员冷启动语义更明确：用户拒绝就是不启动。
- 窗口位置记忆使其更适合作为桌面启动台。

风险：

- Electron 真实冷启动仍然偏慢，Splash 只能降低空白感，不能替代启动性能优化。
- 如果未来 Splash 加功能，必须继续保持静态轻量。

### 5.2 应用管理与添加入口

当前支持：

- 添加 `.exe`。
- 搜索本机候选并添加到当前/默认应用分组。
- 拖入 `.exe` 自动添加到当前/默认应用分组。
- 修改启动程序。
- 编辑启动参数和工作目录。
- 移动分组。
- 删除应用。
- 应用卡片拖拽排序。
- 应用拖到侧栏移动分组。
- 高分辨率图标缓存和 fallback 图标。

本机候选来源：

- 系统开始菜单。
- 用户开始菜单。
- 用户桌面。
- 公共桌面。
- Everything 作为补充候选源。

搜索候选排序会优先保留更像“应用”的结果，例如开始菜单/桌面快捷方式，并降权 helper、updater、uninstall、crashpad、service、renderer、utility 等结果。

拖放添加：

- 渲染层使用 `getPathForFile(file)` 取得真实路径。
- 主进程 `apps:addDroppedExecutables` 校验路径存在且扩展名为 `.exe`。
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
- 一键启动勾选：
  - 左上角圆点独立按钮，点击或 Space 切换。
- 关闭运行应用：
  - 右上角运行状态灯 hover/focus 后显示红色 X。
  - 点击 X 触发关闭确认。
  - 点击 X 会阻止冒泡，避免触发卡片选择/启动/唤起。

键盘能力：

- 方向键 / WASD 按网格几何关系移动选择，而不是简单数组顺序。
- Enter 复用现有主操作：启动或唤起。
- Space 切换当前选中应用是否加入一键启动。
- Esc 关闭浮层、搜索、菜单或取消当前选中。
- Menu 键 / Shift+F10 打开当前应用菜单。
- F2 重命名当前应用。
- `Ctrl+F` / `Ctrl+K` 聚焦搜索框并阻止浏览器默认查找。
- `Ctrl+W/S`、`Ctrl+ArrowUp/Down` 切换相邻 section。
- `Ctrl+1/2/3` 跳转第 1/2/3 个用户应用分组。

输入保护：

- 焦点在 input、textarea、select、contenteditable 或弹窗输入框中时，WASD 和方向键不控制应用卡片。
- Win/Meta 组合键不触发 Start Engineer 分组切换，避免抢 Windows `Win+Arrow`。

### 5.4 应用启动

主进程通过 PowerShell `Start-Process` 启动应用，支持：

- 可执行文件路径。
- 工作目录。
- 启动参数。
- 启动前路径检查。
- 已运行检测。
- 返回 `launched` / `alreadyRunning` / `cancelled` / `failed`。

启动后处理：

- 记录启动 PID。
- 延迟刷新运行快照。
- 尝试学习本次启动 PID 派生出的同目录子进程，写入运行期关联 PID。

风险：

- 游戏启动器、客户端更新器、多进程壳仍可能“启动器退出、真实窗口在子进程/其他进程”。
- 关联 PID 只在运行期保留，重启 Start Engineer 后需要重新通过路径/进程名匹配。

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
- 当前视图运行应用批量关闭。
- 进程页结束进程组。
- 批量 PID 去重。
- 危险进程保护。
- Start Engineer 自身进程保护。
- 普通 `taskkill /T /F` 失败后按需 UAC。
- 管理员 taskkill 后以二次快照为准，不直接把 PowerShell 堆栈暴露给用户。

近期优化点：

- 关闭后的运行状态反馈轮询已调快，用于缩短绿灯熄灭延迟。
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
- `managed` 只返回应用和指标。
- `full` 返回应用、指标、聚合进程列表。
- 约 800ms TTL。
- single-flight：`full` 不复用 managed-only 采集；managed 可以复用 full。
- 进程页刷新频率高于应用页/设置页。
- 进程页默认 `processFilter = "managed"`，用户可切到全部进程。
- 启动后后台预热一次 full 快照。
- 进程页使用虚拟列表。
- 非托管进程图标异步解析，不阻塞首个 full 结果。

采集来源：

- PowerShell `Get-Process`
- PowerShell / CIM `Win32_Process`

风险：

- PowerShell + CIM 成本高。
- 全进程快照在低性能机器上可能慢。
- 进程路径可能读不到。
- CPU/磁盘速率需要两次采样，首次为 0 属正常。

建议：

- 中期考虑长期运行 helper 或 native Windows 采集模块。
- 对应用页只采已管理应用相关 PID。
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

### 5.10 主题、Wallpaper Glass 与 UI 分享码

当前主题：

- `fluent`
- `midnight`
- `utility`
- `glass`
- `wallpaper`
- `system`

Wallpaper Glass：

- 深色/浅色变体。
- 0-100 数值融合强度。
- 设置页滑条支持拖动实时预览，提交时保存偏好。
- 使用 `data-theme="wallpaper"`、`data-wallpaper-intensity`、`data-wallpaper-variant` 控制。
- 透明窗口背景。
- 对主要容器使用玻璃变量和 blur。
- `prefers-reduced-transparency` 下回退为更不透明背景。

受约束 UI 编辑：

- 当前不是自由画布编辑器，而是受约束的设置项组合。
- 可调卡片大小、网格密度、侧栏宽度、顶部图标大小、背景色调、显示应用名称、显示搜索栏、显示运行状态、显示批量按钮。
- 这些设置写入 `preferences.uiLayout`。

UI 分享码：

- 编码前缀：`seui:v1:`
- 实现文件：`src/shared/ui-layout-share.ts`
- 分享码只包含受约束 UI layout，不包含应用列表、路径、分组、壁纸文件或隐私数据。
- 导入失败原因包括 `invalid-prefix`、`unsupported-version`、`invalid-payload`。

设计风险：

- 透明窗口和动态壁纸下，过多 blur 可能影响性能。
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
- 管理员模式。
- 运行应用置顶。
- 受约束 UI 编辑和分享码导入导出。
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

### 6.2 PowerShell 依赖仍偏重

当前以下能力仍依赖 PowerShell：

- 启动应用。
- 采集进程信息。
- 窗口聚焦 helper 缺失时 fallback。
- 权限检测。
- 部分图标/系统能力 fallback。

风险：

- 启动慢。
- 编码问题。
- 执行策略/安全软件干扰。
- Windows PowerShell 与 PowerShell 7 行为差异。

建议优先把进程采集和启动/权限辅助逐步迁移到 native helper 或长期运行 service。

### 6.3 主进程和渲染入口仍偏大

`main.ts` 和 `main.tsx` 都承担过多职责。短期可继续开发，但每加一个功能都会提高回归风险。建议在下一轮大型功能前做结构性拆分。

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

建议拆分：

- `config-store.ts`
- `app-service.ts`
- `group-service.ts`
- `launch-service.ts`
- `runtime-service.ts`
- `window-service.ts`
- `search-service.ts`
- `ipc.ts`

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
  - `preferences.allAppsView.launchSelectedAppIds`。
  - 一键启动和关闭全部。
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
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run smoke`
  - `npm run package:win`

## 12. 关键文件索引

- `D:\Code\Start Engineer\package.json`
  - 脚本、依赖、electron-builder 配置、helper 资源、产品名和打包产物命名。
- `D:\Code\Start Engineer\native\window-focus-helper\Program.cs`
  - Windows 窗口扫描、过滤、评分和聚焦 helper。
- `D:\Code\Start Engineer\scripts\build-window-helper.mjs`
  - `dotnet publish` helper 到 `dist-native/window-focus-helper/win-x64`。
- `D:\Code\Start Engineer\src\shared\types.ts`
  - 应用、分组、系统 section、偏好、运行快照、搜索、批量操作和 preload API 类型。
- `D:\Code\Start Engineer\src\shared\ui-layout-share.ts`
  - 受约束 UI layout 默认值、归一化、分享码编码/解码。
- `D:\Code\Start Engineer\src\main\main.ts`
  - 主进程总入口和 IPC 注册。
- `D:\Code\Start Engineer\src\main\runtime-monitor.ts`
  - 进程采集结果聚合、应用匹配、运行指标、进程页数据。
- `D:\Code\Start Engineer\src\main\window-manager.ts`
  - 应用窗口唤起、窗口列表、诊断信息、safe activation。
- `D:\Code\Start Engineer\src\main\focus-window.ts`
  - helper runner、PowerShell fallback、窗口阶段构造和聚焦 API。
- `D:\Code\Start Engineer\src\main\process-termination.ts`
  - taskkill、UAC、PID 清洗和关闭验证。
- `D:\Code\Start Engineer\src\main\app-discovery.ts`
  - 首次导入候选和搜索可添加本机应用候选。
- `D:\Code\Start Engineer\src\main\dropped-apps.ts`
  - 拖入 `.exe` 添加应用的主进程逻辑。
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
- `D:\Code\Start Engineer\src\renderer\section-apps.ts`
  - 普通分组和 `all-apps` 聚合视图的应用列表、排序和勾选辅助。
- `D:\Code\Start Engineer\src\renderer\keyboard-navigation.ts`
  - 应用网格键盘导航和分组快捷键判断。
- `D:\Code\Start Engineer\src\renderer\pages.tsx`
  - 进程页和分组页组件。
- `D:\Code\Start Engineer\src\renderer\styles.css`
  - 全局布局、应用卡片、设置页、多主题、Wallpaper Glass、受约束 UI layout 样式。
- `D:\Code\Start Engineer\src\renderer\startup-schedule.ts`
  - 启动后延迟任务和进程页预热时机。
- `D:\Code\Start Engineer\scripts\smoke.mjs`
  - 生产构建烟测。

## 13. 当前结论

Start Engineer 已经不只是一个简单启动器。当前代码已经具备应用分组、聚合应用视图、首次导入、搜索添加、拖放添加、可安装应用安全入口、运行监控、批量操作、Everything 兜底搜索、托盘、全局快捷键、管理员模式、Splash、受约束 UI 编辑、UI 分享码、Wallpaper Glass、native 窗口 helper 和窗口唤起诊断等较完整的桌面应用能力。

下一阶段最重要的不是继续堆新入口，而是把“运行中应用单击唤起窗口”这条主路径做稳、做快，并降低后台监控成本。只要窗口唤起、运行识别和关闭反馈可靠，Start Engineer 才能真正承担“桌面启动台 / 任务栏辅助入口”的角色。随后再拆分大型控制器、整理设置页信息架构、补齐发布能力，项目会明显更接近可公开发布的状态。
