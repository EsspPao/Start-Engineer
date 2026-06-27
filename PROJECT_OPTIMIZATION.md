# PROJECT_OPTIMIZATION

本文档基于当前仓库 `D:\Code\Start Engineer` 的真实代码整理，面向后续接手的 AI / 开发者。它不是普通用户说明书，也不是营销介绍；核心目标是帮助后来者快速理解 Start Engineer 现在做到了什么、还欠什么、哪里容易踩坑，以及下一步应该怎样优化。

参考来源包括现有 `PROJECT_OPTIMIZATION_REVIEW.md`、当前 `package.json`、`src/main`、`src/renderer`、`src/shared`、测试文件和打包配置。请注意：本文只把代码中已经存在的能力写为“当前能力”；未来想做但尚未落地的内容会明确放在“建议/风险/路线图”中。

## 1. 项目定位与当前状态

Start Engineer 当前是一个 Windows 桌面启动台与进程监控工具，定位正在从“个人应用分组启动器”演进为“桌面启动台 / 任务栏替代入口”。它面向 Windows 10/11，使用 Electron + React + TypeScript 实现。

当前核心能力：

- 按分组管理应用。
- 添加、修改、移动、删除应用。
- 应用卡片支持单击选中、双击启动、运行中单击/双击唤起窗口。
- 支持一键启动当前分组中勾选的应用。
- 支持关闭单个应用、关闭当前分组内运行应用、结束进程页中的进程组。
- 支持进程监控页，展示 CPU、内存、磁盘速率和聚合进程。
- 支持运行状态识别，运行指标包含 `matchedPids`、`associatedPids`、`matchedProcessNames`、`matchedPaths`。
- 支持同一程序出现在多个分组时同步运行绿点。
- 支持首次启动扫描开始菜单和桌面快捷方式，并提供候选导入。
- 支持 Everything 文件搜索和内部应用/进程搜索。
- 支持一键准备 Everything 便携依赖。
- 支持全局快捷键唤出 / 隐藏主窗口。
- 支持开机自启、关闭到托盘、托盘菜单。
- 支持可选管理员模式和按目标权限重启。
- 支持窗口大小和位置记忆。
- 支持 Splash Window，降低双击 EXE 后的空白等待感。
- 支持多主题，包括 `Fluent`、`Midnight`、`Modern Utility`、`Refined Glass`、`Wallpaper Glass` 和跟随系统。
- `Wallpaper Glass` 支持深色/浅色变体和弱/中/强融合强度。
- 支持隐藏主界面应用名称，并在隐藏名称时放大卡片图标。
- 支持应用卡片拖拽排序和拖到侧栏移动分组。

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

## 2. 设计原则

本章应作为后续功能判断的第一优先级。Start Engineer 不是信息越多越好，也不是功能入口越多越好。它应该是一个轻、快、干净、可靠的桌面启动台。

### 2.1 低文字密度

主界面应优先用视觉状态表达，不要堆文字。当前代码已经在朝这个方向走：

- 运行中：右上角绿色状态灯。
- 关闭运行应用：绿灯 hover / focus 后变为红色 X。
- 启动中：卡片遮罩 + spinner。
- 路径疑似失效：红色警告角标。
- 一键启动勾选：左上角勾选圆点。
- 当前选中：卡片高亮。

后续新增状态时应遵守：

- 能用灯点、角标、颜色表达的，不写长句。
- 详细解释放 Tooltip、Toast、右键菜单、诊断信息或设置页。
- 主界面不显示完整路径、PID、启动参数、PowerShell 错误堆栈。
- Toast 要短，诊断要可复制，二者不要混在一起。

### 2.2 桌面启动台优先

Start Engineer 的长期方向是“桌面启动台 / 任务栏替代入口”，但不能默认强制隐藏 Windows 任务栏，也不能偷偷修改系统设置。

这意味着：

- 运行中的应用单击必须尽量唤起已有窗口。
- 未运行应用双击才启动。
- 关闭应用必须是明确危险操作，只能从红色 X、右键菜单或确认弹窗触发。
- 多窗口应用应该优先唤起最近使用或主窗口，右键菜单可承载窗口列表。
- 找不到窗口时只提示，不重复启动、不误关闭。
- 可提示用户使用 Windows 自动隐藏任务栏，但不能替用户静默开启。

### 2.3 轻量优先

启动台首先要“出现得快、操作不粘、后台安静”。当前已有 Splash、启动后延迟刷新图标、进程页后台预热、managed/full 快照分离等优化。后续仍应继续：

- 首屏优先展示应用和分组。
- Everything、图标刷新、进程 full 快照都应延后或后台处理。
- 托盘/隐藏状态下避免高频轮询。
- 不为视觉效果引入持续大面积动画。
- 高频列表中避免昂贵滤镜。

### 2.4 安全可控

Start Engineer 会启动程序、结束进程、申请管理员、下载 Everything 依赖，这些都属于敏感行为。原则是：

- 用户显式触发。
- 危险操作确认。
- 不静默提升权限。
- 不静默隐藏系统任务栏。
- 不移动用户鼠标。
- 不模拟点击系统托盘图标，除非未来做成明确可控的高级选项。
- 不把调试脚本细节直接展示给普通用户。

### 2.5 减少首次配置

当前已经实现首次扫描开始菜单和桌面快捷方式候选导入。后续应继续减少“手动找 exe”的成本：

- 优化候选去重和分组推荐。
- 提供更好的首次导入 UI。
- 对路径失效提供一键重新选择。
- 允许导入后快速清理不需要的应用。

### 2.6 真实能力优先于漂亮假象

窗口唤起、运行状态识别、进程关闭这类能力必须诚实。能做到就做，做不到要给出可诊断失败，而不是：

- 运行中但实际无法唤起时误报成功。
- 找不到窗口就重新启动，导致打开第二个实例。
- 微信托盘状态下恢复不稳定却强行弹空白窗口。
- 用鼠标移动/点击托盘来伪造恢复。

## 3. 技术栈与架构

### 3.1 技术栈

- Electron 33
- React 18
- TypeScript 5
- Vite 5
- Vitest
- electron-builder
- 原生 CSS 变量主题系统

当前没有使用：

- Redux / Zustand / MobX
- UI 组件库
- SQLite
- Electron Store
- 自动更新库
- 原生 Node addon

### 3.2 主要目录

```txt
D:\Code\Start Engineer
  build\
    icon.ico
    icon.png
    icon.svg
    tray-icon.png
  release\
    Start-Engineer-Portable-0.1.0.exe
    Start-Engineer-Setup-0.1.0.exe
  scripts\
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
- `ipc-register`

### 3.4 渲染层职责

`src/renderer/main.tsx` 是渲染层主控制器，负责：

- 加载分组、应用、偏好。
- 首次导入弹层。
- 运行快照轮询。
- 进程页后台预热。
- 搜索框和搜索结果面板。
- 右键菜单。
- 确认弹窗。
- 设置页折叠面板。
- 拖拽排序和移动分组。
- 应用启动/关闭反馈。
- 主题属性写入 `document.documentElement.dataset`。

`src/renderer/pages.tsx` 包含 `ProcessPage` 和 `GroupPage`。其中进程页使用轻量虚拟列表，分组页负责应用卡片、底部操作栏和卡片交互。

渲染层后续也建议拆分：

- `AppShell`
- `Sidebar`
- `TopbarSearch`
- `GroupPage`
- `ProcessPage`
- `SettingsPage`
- `ContextMenus`
- `Dialogs`
- `ImportWizard`
- `useRuntimePolling`
- `useSearch`
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

### 4.3 AppEntry 当前字段

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
- `launchSelected` 是“一键启动勾选”，不等于当前选中卡片。

### 4.4 AppPreferences 当前字段

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
- `wallpaperGlassIntensity: "medium"`
- `wallpaperGlassVariant: "dark"`
- `runAsAdministrator: false`
- `searchProvider: "everything"`
- `sortRunningAppsFirst: true`
- `showAppNames: false`
- `firstRunImportCompleted: false`

注意：项目 owner 曾确认未来倾向“默认开机自启、默认管理员常用模式”，但当前代码默认值仍是 `launchAtStartup: false`、`runAsAdministrator: false`。如果后续要调整默认行为，需要明确改 `defaultPreferences` 并验证首次启动体验。

## 5. 当前功能实现分析

### 5.1 启动流程与 Splash

启动流程重点：

- `app.whenReady()` 后创建 Splash Window。
- 主窗口先 `show: false` 创建。
- 主窗口 `ready-to-show` 后显示主窗口并销毁 Splash。
- Splash 使用静态 HTML/CSS，不复用 React。
- 主窗口支持透明背景，并按主题设置 Mica 或 none。
- 窗口 bounds 通过 `windowBounds` 持久化，保存时跳过最小化和全屏状态。

优势：

- 双击 EXE 后更快获得可见反馈。
- 主界面不被 Splash 阻塞。
- 窗口位置记忆使其更适合作为桌面启动台。

风险：

- Electron 真实冷启动仍然偏慢，Splash 只能降低空白感，不能替代启动性能优化。
- 如果未来 Splash 加功能，必须继续保持静态轻量。

### 5.2 应用管理

当前支持：

- 添加 `.exe`。
- 修改启动程序。
- 编辑启动参数和工作目录。
- 移动分组。
- 删除应用。
- 应用卡片拖拽排序。
- 应用拖到侧栏移动分组。
- 高分辨率图标缓存和 fallback 图标。

应用排序：

- 通过 `reorderAppsInGroup(groupId, appIds)` 保存。
- 搜索过滤时可重排当前可见卡片，隐藏项保持相对顺序。
- `sortRunningAppsFirst` 开启时只影响显示顺序，不改变底层保存顺序。

### 5.3 应用卡片交互

当前规则：

- 未运行应用：
  - 单击：选中。
  - 双击：启动。
- 运行中应用：
  - 单击：选中并尝试唤起窗口。
  - 双击：尝试唤起窗口，不重复启动。
- 启动中应用：
  - 单击：选中。
  - 双击：轻提示，不重复启动。
- 一键启动勾选：
  - 左上角圆点独立按钮，点击切换 `launchSelected`。
- 关闭运行应用：
  - 右上角运行状态灯 hover/focus 后显示红色 X。
  - 点击 X 触发关闭确认。
  - 点击 X 会阻止冒泡，避免触发卡片选择/启动/唤起。

优势：

- “当前选中”和“一键启动勾选”已拆开，交互语义更清楚。
- 关闭应用不再由卡片主体触发，降低误关风险。

仍需注意：

- 卡片单击和双击的细节在 `app-card-interaction.ts`、`pages.tsx`、`main.tsx` 中共同作用，改动时必须跑交互测试。
- 窗口唤起失败时不能 fallback 到重新启动，尤其是微信。

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

这是当前最关键、最脆弱的能力。

涉及文件：

- `src/main/window-manager.ts`
- `src/main/focus-window.ts`
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
  - matched
  - children
  - directory
  - name
  - title
- 枚举顶层窗口并评分。
- 支持缓存最近成功窗口候选。
- 支持 stale request 防串台。
- 支持窗口列表和窗口诊断复制。

当前明确约束：

- 不应移动用户鼠标。
- 不应通过点击任务栏/托盘来恢复窗口。
- 微信不应使用 fallback relaunch。
- 微信托盘恢复如果不可靠，应返回 `trayRestoreUnsupported` 等失败原因。

已知风险：

- 当前实现仍依赖 PowerShell 中的 Windows API 调用，不是 native addon。
- 微信、Notion、Electron/Chromium 类应用、多进程应用的窗口结构复杂，仍可能匹配失败。
- Windows 前台切换限制可能导致找到窗口但 `SetForegroundWindow` 失败。
- 某些托盘应用没有通用可靠恢复方式。

后续最值得投入的方向：

- 用原生 Windows helper 替代 PowerShell 窗口枚举与聚焦脚本。
- 保存最近成功的 hwnd / pid / className / title 结构，并做严格验证。
- 为多窗口应用右键菜单提供窗口列表选择。
- 将窗口诊断信息结构化为 JSON，便于后续 AI 分析。

### 5.6 应用关闭与批量关闭

涉及文件：

- `src/main/process-termination.ts`
- `src/main/batch-app-actions.ts`
- `src/main/main.ts`

当前能力：

- 单应用关闭。
- 当前分组运行应用批量关闭。
- 进程页结束进程组。
- 批量 PID 去重。
- 危险进程保护。
- Start Engineer 自身进程保护。
- 普通 `taskkill /T /F` 失败后按需 UAC。
- 管理员 taskkill 后以二次快照为准，不直接把 PowerShell 堆栈暴露给用户。

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
- 进程页 1s 刷新。
- 应用/设置页约 5s 刷新。
- 启动后约 1.8s 后台预热一次 full 快照。
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

### 5.8 首次应用导入

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

### 5.9 搜索

当前搜索模式：

- Everything 文件搜索。
- 内部应用/进程搜索。

Everything 依赖：

- 优先用户配置路径。
- 其次 PATH / 常见目录。
- 再次自管目录。
- 可一键下载 Everything 便携版和 ES CLI 到用户数据目录。

搜索交互：

- 实时输入。
- 方向键选择。
- 自动滚动选中项。
- 回车打开。
- Esc 关闭。
- 点击外部关闭搜索面板。
- 结果可打开、显示所在文件夹、复制路径。

已知限制：

- 内部搜索目前主要是 normalize + includes，没有拼音/首字母/模糊容错。
- Everything 搜索结果排序依赖 ES/Everything 自身。
- 自管 Everything 依赖需要联网下载，离线用户需手动选择 ES.exe。

### 5.10 主题与视觉

当前主题：

- `fluent`
- `midnight`
- `utility`
- `glass`
- `wallpaper`
- `system`

Wallpaper Glass：

- 深色/浅色变体。
- 弱/中/强融合强度。
- 使用 `data-theme="wallpaper"`、`data-wallpaper-intensity`、`data-wallpaper-variant` 控制。
- 透明窗口背景。
- 对主要容器使用玻璃变量和 blur。
- `prefers-reduced-transparency` 下回退为更不透明背景。

设计风险：

- 透明窗口和动态壁纸下，过多 blur 可能影响性能。
- 浅色玻璃在明亮壁纸上可读性更脆弱。
- 后续视觉改动要优先保护操作清晰度，不要为了质感牺牲可读性。

### 5.11 设置页

当前设置页包含：

- 常规设置折叠面板。
- 界面主题折叠面板。
- 搜索依赖折叠面板。
- 分组管理。
- 开机启动。
- 关闭行为。
- 全局快捷键。
- 管理员模式。
- 运行应用置顶。
- 显示应用名称。
- 搜索提供方。
- Wallpaper Glass 变体和强度。
- Everything 依赖状态/准备。
- 分组展开查看应用。

已知趋势：

- 设置项已经偏多，继续加功能前应考虑拆成更清晰的“常规 / 外观 / 搜索 / 高级 / 关于”。

## 6. 当前已知问题与风险

### 6.1 窗口唤起仍是最大风险

原因：

- 不同应用窗口结构差异很大。
- 微信/Notion/Electron/Chromium/游戏启动器可能有多进程、多窗口、托盘隐藏、owner window、无标题窗口。
- Windows 前台切换有系统限制。
- 当前依赖 PowerShell 脚本调用 Windows API，速度和稳定性不如原生 helper。

当前最重要原则：

- 找不到就提示。
- 不重新启动已运行应用。
- 不移动鼠标。
- 不点击托盘。
- 不把疑似 shell/helper 窗口当主窗口。

### 6.2 PowerShell 依赖偏重

当前以下能力依赖 PowerShell：

- 启动应用。
- 采集进程信息。
- 窗口枚举与唤起。
- 权限检测。
- 部分图标/系统能力 fallback。

风险：

- 启动慢。
- 编码问题。
- 执行策略/安全软件干扰。
- Windows PowerShell 与 PowerShell 7 行为差异。

建议优先把窗口唤起和进程采集逐步迁移到原生 helper。

### 6.3 主进程和渲染入口仍偏大

`main.ts` 和 `main.tsx` 都承担过多职责。短期可继续开发，但每加一个功能都会提高回归风险。建议在下一轮大型功能前做结构性拆分。

### 6.4 默认偏好与产品决策存在差异

owner 曾确认未来倾向：

- 默认开机自启。
- 默认关闭到托盘。
- 管理员运行作为常用模式。

但当前代码默认：

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

### 7.1 原生窗口唤起 helper

目标：让 Start Engineer 真正替代任务栏入口。

建议：

- 新增专用 Windows helper，负责枚举窗口、读取 PID/路径/class/title、恢复最小化、前台激活。
- 避免 PowerShell 编码和启动成本。
- 返回结构化候选列表和失败原因。
- 支持多窗口列表。
- 保留“不移动鼠标、不点击托盘、不 relaunch 微信”的安全边界。

涉及：

- `src/main/window-manager.ts`
- `src/main/focus-window.ts`
- `src/shared/types.ts`
- `src/renderer/main.tsx`

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
- 路径失效做启动前批量检测。
- 应用详情抽屉显示路径、参数、匹配 PID、窗口诊断。
- 配置导入/导出。
- 图标缓存清理。
- About 页面显示版本、数据目录、依赖状态。
- 首次导入候选增加更好去重和推荐排序。
- 多窗口应用右键菜单支持直接切换到具体窗口。

## 9. 低优先级 / 未来发布项

- 自动更新。
- 代码签名。
- 崩溃上报。
- 系统通知。
- 多套启动方案。
- 游戏账号/启动参数模板。
- 多用户配置。
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

- 修复并加速窗口唤起。
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

- 不要把 `PROJECT_OPTIMIZATION_REVIEW.md` 中的旧描述直接当作当前事实，先看 `src/shared/types.ts` 和实际 IPC。
- 修改窗口唤起时务必跑 `focus-window.test.ts` 和 `window-manager.test.ts`。
- 修改卡片交互时务必跑 `pages.test.ts`、`app-card-interaction.test.ts`、`card-click.test.ts`。
- 修改运行识别时务必跑 `runtime-monitor.test.ts`、`batch-app-actions.test.ts`。
- 修改偏好时同步：
  - `src/main/preferences.ts`
  - `src/shared/types.ts`
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
- 每次代码改动后按项目当前约定至少执行：
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run smoke`
  - `npm run package:win`

## 12. 关键文件索引

- `D:\Code\Start Engineer\package.json`
  - 脚本、依赖、electron-builder 配置、产品名和打包产物命名。
- `D:\Code\Start Engineer\src\shared\types.ts`
  - 应用、分组、偏好、运行快照、搜索、批量操作和 preload API 类型。
- `D:\Code\Start Engineer\src\main\main.ts`
  - 主进程总入口和 IPC 注册。
- `D:\Code\Start Engineer\src\main\runtime-monitor.ts`
  - 进程采集结果聚合、应用匹配、运行指标、进程页数据。
- `D:\Code\Start Engineer\src\main\window-manager.ts`
  - 应用窗口唤起、窗口列表、诊断信息。
- `D:\Code\Start Engineer\src\main\focus-window.ts`
  - Windows 窗口枚举、评分、聚焦脚本构造。
- `D:\Code\Start Engineer\src\main\process-termination.ts`
  - taskkill、UAC、PID 清洗和关闭验证。
- `D:\Code\Start Engineer\src\main\app-discovery.ts`
  - 首次导入候选构造和分组推荐。
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
- `D:\Code\Start Engineer\src\renderer\pages.tsx`
  - 进程页和分组页组件。
- `D:\Code\Start Engineer\src\renderer\styles.css`
  - 全局布局、应用卡片、设置页、多主题、Wallpaper Glass。
- `D:\Code\Start Engineer\src\renderer\startup-schedule.ts`
  - 启动后延迟任务和进程页预热时机。
- `D:\Code\Start Engineer\scripts\smoke.mjs`
  - 生产构建烟测。

## 13. 当前结论

Start Engineer 已经不只是一个简单启动器。当前代码已经具备应用分组、首次导入、运行监控、批量操作、Everything 搜索、托盘、全局快捷键、管理员模式、Splash、Wallpaper Glass 和窗口唤起诊断等较完整的桌面应用能力。

下一阶段最重要的不是继续堆新入口，而是把“运行中应用单击唤起窗口”这条主路径做稳、做快。只要这个能力可靠，Start Engineer 才能真正承担“桌面启动台 / 任务栏替代入口”的角色。随后再优化进程监控成本、拆分大型控制器、整理设置页信息架构，项目会明显更接近可公开发布的状态。
