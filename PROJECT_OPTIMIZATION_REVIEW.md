# Start Engineer 项目优化分析文档

本文档基于当前仓库 `D:\Code\Start Engineer` 的真实代码生成，面向后续接手的 AI 或开发者。当前目标不是修复启动或打包问题，而是继续让 Start Engineer 更轻量、更稳定、更易用，并更接近一个成熟的 Windows 桌面应用。


## 1. 项目当前状态概述

- 项目名称：Start Engineer。
- 项目用途：Windows 桌面应用启动器与进程监控工具，用于按分组管理常用应用、快速启动应用、批量启动/关闭分组内应用，并查看系统进程资源占用。
- 当前核心功能：
  - 应用分组管理：新增、重命名、更换图标、删除、排序。
  - 应用管理：添加 `.exe`、修改启动程序、编辑启动参数和工作目录、移动分组、移除应用。
  - 应用启动：单个启动、双击启动、勾选后一键启动当前分组选中应用。
  - 应用关闭：单应用关闭、当前分组运行应用批量关闭、进程页结束进程组。
  - 资源监控：CPU、内存、磁盘读写速率、进程聚合、已管理应用识别。
  - 图标缓存：Shell 高分辨率图标提取、PNG 缓存、SVG 首字母 fallback。
  - Windows 桌面体验：无边框窗口、自定义窗口按钮、托盘、开机自启、关闭到托盘、全局快捷键、管理员模式重启。
  - 搜索：Everything 文件搜索、内部应用/进程搜索、搜索依赖一键准备。
  - UI 主题：Fluent、Midnight、Modern Utility、Refined Glass、跟随 Windows。
- 当前运行状态：项目已能启动、主要功能可运行，已有 `npm run test`、`npm run typecheck`、`npm run build`、`npm run smoke`、`npm run package:win` 等验证/打包脚本。
- 当前打包方式：使用 `electron-builder` 生成 Windows NSIS 安装包和 portable 便携版。
- 当前 `.exe` 使用方式：
  - 安装版：`release/Start-Engineer-Setup-0.1.0.exe`，交互式安装。
  - 便携版：`release/Start-Engineer-Portable-0.1.0.exe`，双击运行。
  - 当前产物体积约 82 MB，主要来自 Electron Runtime。
- 距离正式可发布版本的差距：
  - 缺少签名证书和自动更新。
  - 资源监控依赖 PowerShell/WMI，稳定性和性能仍需长期观察。
  - 应用识别和启动器子进程追踪仍是启发式方案，复杂游戏启动器可能误判。
  - 设置项较多，首次使用仍需要用户手动添加应用。
  - 缺少完整的新手引导、默认导入、故障诊断页和更完善的发布文档。

## 2. 设计原则

Start Engineer 后续优化应优先围绕“轻便、人性化、易操作”展开。新增功能时，不能只看功能是否完整，还要看它是否减少用户操作、降低理解成本、保持界面干净。

### 2.1 低文字密度 UI 设计原则

Start Engineer 的界面目标应明确为：低文字密度、状态视觉化、操作入口清晰。主界面不应出现大段说明文字，也不应把每一种状态都直接写成完整句子。用户应该能够通过图标、状态灯、颜色、轻量动效和短按钮快速理解当前状态；详细解释只在悬停、点击、详情面板、诊断页或弹窗中出现。

当前项目中“应用右上角绿灯表示正在运行”的设计方向是正确的，建议继续保留并扩展为统一的状态视觉语言。

建议的状态表达方式：

| 状态 | 推荐表达 | 不推荐表达 |
| --- | --- | --- |
| 正在运行 | 右上角绿灯/绿点 | 在卡片上显示“正在运行中” |
| 启动中 | 小型 loading、呼吸动画或半透明遮罩 | 在卡片上显示“正在启动，请稍候” |
| 路径失效 | 红色警告角标，悬停显示原因 | 在卡片上显示“程序路径不存在，请重新选择” |
| 需要管理员权限 | 盾牌图标 | 在卡片上显示“该应用可能需要管理员权限” |
| 上次启动失败 | 橙色感叹号，点击查看详情 | 在卡片上显示完整失败原因 |
| 已加入一键启动 | 小勾、星标或选中态 | 在卡片上显示“已选择为一键启动应用” |
| 后台监控暂停 | 低功耗/月亮/暂停图标 | 显示长段节能说明 |

主界面卡片默认只建议展示：

- 应用图标。
- 应用名称。
- 状态灯或状态角标。
- 简短资源占用信息，例如 CPU、内存小数字或轻量进度条。
- 启动按钮和更多操作入口。

不建议默认展示完整路径、启动参数、工作目录、PID、匹配进程列表、详细错误原因等高密度信息。这些信息应放到应用详情抽屉、右键菜单、诊断页面或“复制诊断信息”中。

错误状态应做到“页面上看得出来，但不吵”。例如路径失效时，卡片上只显示红色警告角标和一个简短的“重新选择”操作；详细原因通过 Tooltip 或详情面板展示。重要错误可以提供“查看详情”和“复制诊断信息”，但不要直接把系统错误堆在主界面。

设置页也应遵守低文字密度原则：每个设置项默认只显示短标题、开关或选择器；解释文字放入问号 Tooltip、帮助面板或折叠详情中。例如“低功耗模式”旁边只放一个问号，悬停后再解释“托盘后台时暂停资源监控，降低 CPU 占用”。

后续新增功能时应优先遵守以下规则：

- 能用状态灯表达的，不直接写状态句子。
- 能用图标和颜色表达的，不堆说明文字。
- 能用 Tooltip 解释的，不占用主界面空间。
- 能放进详情页的，不放在卡片默认视图里。
- 主界面优先服务“快速启动”和“一眼看状态”，高级信息放到二级入口。

### 2.2 轻量优先原则

Start Engineer 应优先保持启动快、后台安静、资源占用低。资源监控、搜索依赖、图标解析、完整进程采集等功能应按需启用，避免为了展示更多信息而长期高频轮询。

建议默认采用平衡或低功耗策略：窗口可见时正常刷新，托盘后台时降频或暂停；进程页需要实时性，应用启动页更重视轻便和稳定。

### 2.3 一眼可操作原则

主界面应让用户一眼知道可以做什么：启动应用、一键启动、关闭运行应用、搜索应用、查看简单资源状态。高级操作应放到右键菜单、更多按钮、设置页或详情面板中，避免默认界面同时暴露过多入口。

应用卡片和分组页面应优先服务日常高频操作，不应把完整路径、启动参数、PID、诊断信息等低频内容直接铺在主界面上。

### 2.4 减少首次配置原则

首次使用体验应尽量从“手动一个个添加 .exe”转为“扫描候选应用后勾选导入”。开始菜单、桌面快捷方式、常见软件路径和推荐分组应作为主要导入来源，但不建议默认全盘扫描。

首次引导应短、明确、可跳过。用户不需要理解 Everything、WMI、PowerShell 等技术细节，只需要知道“可以导入应用”“可以一键启动”“可以查看运行状态”。

### 2.5 安全可控原则

启动、关闭、批量结束进程、管理员模式、自动下载搜索依赖等行为都应保持用户可控。危险或不可逆操作需要确认；普通状态提示尽量轻量；重要错误提供详情和复制诊断信息。

默认情况下不应自动执行大范围扫描、联网下载或高权限操作。需要这些能力时，应通过清晰但简短的提示让用户主动开启。


## 3. 技术栈与架构说明

- 前端框架：React 18。
- 桌面端框架：Electron 33。
- 构建工具：Vite 5、TypeScript 5。
- 打包工具：electron-builder 25。
- 状态管理方式：当前未使用 Redux、Zustand、MobX 等状态管理库；渲染层主要使用 React `useState`、`useMemo`、`useCallback`、`useEffect`。
- 样式方案：原生 CSS，集中在 `src/renderer/styles.css`，通过 CSS 变量和 `data-theme` 实现多主题。
- 系统 API 调用方式：
  - Electron 主进程 API：`BrowserWindow`、`Tray`、`Menu`、`dialog`、`shell`、`clipboard`、`globalShortcut`、`nativeTheme`。
  - Windows 命令：`powershell.exe`、`taskkill.exe`、`explorer.exe`。
  - Everything CLI：`ES.exe`。
- 本地数据存储方式：JSON 文件，位于 `%APPDATA%\start-engineer`；图标缓存为 PNG 文件。
- 资源监控实现方式：主进程通过 PowerShell `Get-Process` 与 `Get-CimInstance Win32_Process` 采集进程、PID、父 PID、路径、CPU、内存、读写字节，再由 `RuntimeMonitor` 做 TTL 缓存、差分计算和聚合。
- 程序启动实现方式：主进程使用 PowerShell `Start-Process`，传入应用路径、工作目录和启动参数，返回启动 PID。
- 当前未使用：
  - Tauri。
  - Electron Store。
  - SQLite 或其他数据库。
  - UI 组件库。
  - 自动更新库。
  - 崩溃上报和遥测。

## 4. 项目目录结构说明

```txt
project-root/
  build/
    icon.ico
    icon.png
    icon.svg
    tray-icon.png
  release/
    Start-Engineer-Setup-0.1.0.exe
    Start-Engineer-Portable-0.1.0.exe
    win-unpacked/
  scripts/
    dev.mjs
    generate-icons.ps1
    smoke.mjs
  src/
    main/
      main.ts
      runtime-monitor.ts
      process-termination.ts
      preferences.ts
      everything-search.ts
      search-dependencies.ts
      batch-app-actions.ts
      icon-cache.ts
      config-migration.ts
      user-data-migration.ts
      administrator-launch.ts
      *.test.ts
    preload/
      preload.cts
    renderer/
      main.tsx
      pages.tsx
      styles.css
      search.ts
      app-display.ts
      card-click.ts
      launch-feedback.ts
      search-panel-behavior.ts
      *.test.ts
    shared/
      types.ts
      theme.ts
      global-shortcut.ts
  index.html
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.electron.json
  vite.config.ts
  vitest.config.ts
  README.md
  PROJECT_CONTEXT.md
  RE.md
```

重要文件说明：

- `package.json`：项目脚本、依赖、electron-builder 打包配置、产品名、appId、产物命名。
- `index.html`：渲染进程 HTML 入口。
- `src/main/main.ts`：Electron 主进程入口，包含窗口、托盘、IPC、应用配置、启动、关闭、资源快照、Everything 依赖准备等主要编排。
- `src/preload/preload.cts`：安全桥接层，通过 `contextBridge` 暴露 `window.startEngineer`，并保留 `window.commandDeck` 兼容别名。
- `src/shared/types.ts`：主进程和渲染层共享类型，定义 `AppEntry`、`AppGroup`、`AppPreferences`、搜索结果、运行快照和 API。
- `src/main/runtime-monitor.ts`：资源采集聚合、进程分组、应用匹配、TTL 缓存和 single-flight。
- `src/main/process-termination.ts`：PID 标准化、批量 `taskkill` 参数构造、普通权限失败后的提升处理。
- `src/main/everything-search.ts`：Everything `ES.exe` 参数构造、CSV 解析、GB18030/UTF-8 解码。
- `src/main/search-dependencies.ts`：Everything 便携版和 ES 命令行工具检测、下载、解压。
- `src/main/preferences.ts`：偏好默认值和迁移归一化。
- `src/main/config-migration.ts`：应用和分组配置迁移。
- `src/main/icon-cache.ts`：图标缓存刷新判定。
- `src/renderer/main.tsx`：渲染层主控制器，负责应用状态、轮询、搜索、菜单、弹窗、设置页等。
- `src/renderer/pages.tsx`：进程页和分组应用页组件。
- `src/renderer/styles.css`：全局视觉系统、多主题、布局、卡片、表格、设置页、Toast、菜单和弹窗样式。
- `build/`：正式图标和托盘图标。
- `release/`：打包产物目录。

## 5. 当前功能实现分析

### 5.1 应用启动管理

- 应用列表定义：
  - 类型为 `AppEntry`，字段包括 `id`、`name`、`groupId`、`executablePath`、`processName`、`launchArgs`、`workingDirectory`、`launchSelected`、图标缓存字段等。
  - 数据保存在 `%APPDATA%\start-engineer\apps.json`。
  - 若配置缺失或损坏，`loadApps()` 会回退到 `defaultApps()` 并备份损坏文件。
- 路径配置：
  - 添加应用和修改启动程序通过 Electron `dialog.showOpenDialog` 选择 `.exe`。
  - `addExecutable()` 会自动设置 `name`、`processName`、`workingDirectory` 并缓存图标。
- 启动调用：
  - 渲染层通过 `api().launchApp(id)` 调 IPC `apps:launch`。
  - 主进程 `launchExecutable()` 使用 PowerShell `Start-Process`，并返回 PID。
- 自定义路径：
  - 支持通过“修改启动程序”选择新 `.exe`。
  - 支持编辑 `launchArgs` 和 `workingDirectory`。
- 路径不存在提示：
  - `apps:launch` 在启动前检查 `executablePath` 和 `workingDirectory`，返回“程序路径不存在”或“工作目录无效”。
- 启动前运行检测：
  - 启动前通过 `metricsSnapshot()` 检测当前应用是否已运行，已运行则返回 `alreadyRunning`。
- 批量启动：
  - 支持 `launchSelectedApps(groupId)`，按当前分组配置顺序依次启动勾选应用。
  - 单项失败不会阻断后续应用。
- 一键启动：
  - 当前右下角“一键启动”基于 `launchSelected`。
  - 单个应用双击直接启动，不改变勾选状态。
- 启动后自动最小化或隐藏：
  - 当前代码中未发现启动应用后自动最小化或隐藏 Start Engineer 的功能。
- 启动器子进程识别：
  - 当前会在启动后延迟采集父子进程，并仅将位于应用目录内的子进程 PID 记录为运行期关联 PID。
  - 这是运行时状态，不持久化到 JSON，避免旧别名污染造成误判。

### 5.2 分组管理

- 当前支持应用分组。
- 分组数据结构为 `AppGroup`：`id`、`name`、`icon`、`isSystem`、`order`。
- 系统分组：
  - `processes`：进程页。
  - `settings`：设置页。
- 用户分组：
  - 保存在 `%APPDATA%\start-engineer\groups.json`。
  - 默认分组包括“二游”“办公”“工具”。
- 支持新增、修改、删除、排序。
- 删除分组时要求迁移应用到其他分组。
- 交互便利性：
  - 侧栏可右键分组。
  - 设置页可展开分组查看应用，可拖动手柄排序。
  - 当前交互已比较完整，但设置页功能密度较高，仍需要更清晰的信息层级。

### 5.3 搜索功能

- 搜索逻辑位置：
  - 渲染层内部搜索：`src/renderer/search.ts`。
  - 搜索面板交互：`src/renderer/main.tsx`、`src/renderer/search-panel-behavior.ts`。
  - Everything 搜索：`src/main/everything-search.ts`。
- 搜索支持字段：
  - 内部应用：`name`、`processName`。
  - 内部进程：`name`。
  - Everything：由 ES.exe 返回文件/文件夹名称、路径、大小、修改时间。
- 模糊搜索：
  - 内部搜索使用 `normalize("NFKC")` 后 `includes`，属于基础包含匹配。
  - 当前未发现拼音、首字母、分词、模糊容错算法。
- 搜索体验：
  - 支持实时输入、删除刷新、方向键选择、回车打开、Esc 关闭。
  - 支持点击外部关闭搜索面板。
  - Everything 结果可打开、显示所在文件夹、复制路径。
- 可优化点：
  - 内部搜索可增加拼音/首字母匹配。
  - Everything 搜索可增加排序/过滤配置，如仅程序、仅开始菜单、仅最近修改。
  - 当前 Everything 依赖需要下载或本机已有 ES.exe，虽有一键准备，但首次体验仍可进一步引导。

### 5.4 资源占用监控

- 当前监控 CPU、内存和磁盘读写速率。
- 监控范围：
  - `full` 模式返回全部聚合进程。
  - `managed` 模式只返回应用和指标，`processes` 为空。
- 刷新频率：
  - 进程页约每 1 秒请求完整快照。
  - 应用页/设置页约每 5 秒请求 managed 快照。
  - 页面隐藏时跳过采集。
  - 主进程 `RuntimeMonitor` 内有 800ms TTL 和 single-flight。
- 数据来源：
  - PowerShell `Get-Process` 获取 CPU、内存。
  - `Get-CimInstance Win32_Process` 获取路径、父 PID、读写计数。
- 准确性：
  - CPU 和磁盘速率基于两次采样差分，初次采样通常为 0。
  - 进程路径可能为空，尤其是权限不足或系统进程。
  - 游戏启动器、浏览器多进程、子进程重启场景依赖启发式匹配，存在误判风险。
- 性能风险：
  - PowerShell + CIM 对全进程采集成本不低。
  - 进程页 1 秒刷新对低性能设备可能偏重。
  - 图标解析虽然有缓存，但全进程页首次进入仍可能触发较多图标解析。
- 更轻量实现方向：
  - 用原生 Node addon 或 Windows Performance Counter/WMI 更细粒度查询替代频繁 PowerShell。
  - 对应用页只查询已管理应用相关进程。
  - 对进程页使用渐进式图标加载和更长 TTL。
  - 增加“低功耗监控模式”设置。

### 5.5 Windows 桌面体验

当前支持：

- 开机自启：支持，使用 `app.setLoginItemSettings()`。
- 最小化到托盘：支持。
- 关闭按钮最小化：支持，取决于 `closeBehavior`。
- 后台常驻：支持托盘常驻。
- 托盘菜单：支持“打开 Start Engineer”和“退出”。
- 快捷键：支持全局快捷键，默认 `Ctrl+Shift+Space`。
- 自动保存用户配置：支持 JSON 持久化。
- 深色/浅色主题：支持固定主题和跟随 Windows。
- 管理员方式启动：支持偏好配置和立即按目标权限重启。
- Everything 搜索依赖一键准备：支持。

当前未支持或未完整支持：

- 自动识别已安装程序：当前未发现完整扫描/导入功能。
- 从开始菜单导入应用：当前未支持。
- 从桌面快捷方式导入应用：当前未支持。
- 窗口大小和位置记忆：当前代码中未发现。
- Windows 原生通知：当前主要使用应用内 Toast，未发现系统通知。
- 自动更新：当前未支持。

## 6. 轻量化分析

当前安装版和便携版约 82 MB。对 Electron 应用来说正常，但对“轻量启动器”而言偏大。主要体积来自 Electron Runtime，而不是业务代码。

可优化点：

- Electron 体积：
  - 涉及文件：`package.json`。
  - Electron 天然体积较大。如果“极致轻量”是核心目标，长期可评估 Tauri 或 Wails，但这会重写大量 Electron 主进程能力。
- 依赖数量：
  - 当前生产依赖只有 `react` 和 `react-dom`，开发依赖也比较克制。
  - 当前未发现明显过多的 npm 依赖。
- 静态资源：
  - `build/icon.ico`、`build/icon.png`、`build/tray-icon.png` 是必要资源。
  - 图标缓存位于用户数据目录，长期使用可能积累，建议提供“清理图标缓存”。
- Everything 自管依赖：
  - 下载到 `%APPDATA%\start-engineer\dependencies\everything`。
  - 不打进安装包，避免增大体积，这是合理策略。
- 后台轮询：
  - 涉及文件：`src/renderer/main.tsx`、`src/main/runtime-monitor.ts`。
  - 当前已区分 1 秒 full 和 5 秒 managed，并避免重叠请求。
  - 可继续增加“后台/托盘状态暂停监控”或更低频策略。
- PowerShell 开销：
  - 涉及文件：`src/main/main.ts` 的 `getProcessSnapshots()`。
  - 当前每次采集启动 PowerShell，成本明显高于原生 API。
  - 中长期建议拆为长期运行的采集 helper 或原生采集模块。
- 启动时加载内容：
  - 首屏会并行加载 groups/apps/preferences，并异步刷新图标。
  - 这是合理策略。
  - 可进一步延迟 Everything 依赖状态、进程页完整快照直到用户需要。
- 日志输出：
  - 当前主要 `console.warn` 在图标和子进程学习失败时输出。
  - 建议未来接入可开关日志文件，而不是散落在控制台。

## 7. 用户操作简化分析

当前首次使用仍主要依赖用户手动添加 `.exe`。为了减少用户操作，建议：

- 自动扫描常见软件安装路径：
  - 扫描开始菜单 `.lnk`、桌面快捷方式、`Program Files` 常见目录。
  - 解析 `.lnk` 目标路径，显示候选应用让用户勾选导入。
  - 涉及文件：新增 `src/main/app-discovery.ts`，扩展 `src/main/main.ts` IPC，设置页增加导入入口。
- 自动识别常见应用：
  - Steam、WeChat、Chrome、Edge、QQ、Wegame、VS Code、Cursor、Notion 等。
  - 建议用规则表 + 文件存在检测，不要全盘扫描。
- 记住用户上次选择：
  - 当前应用路径、分组和勾选状态已持久化。
  - 文件选择对话框当前未发现记忆上次目录，可新增偏好字段。
- 常用应用一键启动：
  - 当前通过 `launchSelected` 已支持。
  - 可在首次添加应用时引导“加入一键启动”。
- 工作模式/游戏模式/日常模式：
  - 当前分组已经类似模式，但缺少启动预设。
  - 可扩展为“模式”实体，允许同一应用在多个模式中。
- 拖拽添加应用：
  - 当前未发现从资源管理器拖 `.exe` 到窗口添加。
  - 建议支持拖放 `.exe` 和 `.lnk`。
- 从开始菜单/桌面导入：
  - 当前未支持，优先级高。
- 减少弹窗：
  - 关闭应用仍保留确认，这是安全的。
  - 对批量关闭已做到一次确认。
  - 可给可信应用增加“下次不再确认”但要谨慎。
- 错误提示：
  - 当前有 Toast 和弹窗错误，但部分错误来自系统命令，文字仍可更友好。
  - 建议建立错误码到用户文案映射。
- 默认推荐分组：
  - 当前默认“二游/办公/工具”较个人化。
  - 如果面向发布，建议改为“游戏/办公/工具”或首次启动让用户选择。
- 自动隐藏失效路径：
  - 当前启动前会提示路径不存在。
  - 可在卡片上显示“路径失效”状态，并提供一键重新选择。
- 避免重复启动：
  - 当前已通过运行快照判断。
  - 复杂启动器仍需要继续优化应用关联策略。

## 8. 代码质量分析

- 组件拆分：
  - `src/renderer/pages.tsx` 已拆出 `ProcessPage` 和 `GroupPage`。
  - 但 `src/renderer/main.tsx` 仍承担大量职责：状态管理、搜索、设置页、菜单、弹窗、拖拽、IPC 编排。文件过大，后续维护压力高。
- 主进程职责：
  - `main.ts` 仍很大，包含窗口、托盘、配置、应用、搜索、监控、启动、结束、快捷键等。
  - 已抽出 `runtime-monitor.ts`、`process-termination.ts`、`preferences.ts`、`everything-search.ts` 等模块，这是好的方向。
- 重复代码：
  - 偏好默认值在 `preferences.ts` 与渲染层 `fallbackApi` 中各有一份，存在同步风险。
  - 一些设置页 JSX 过长，建议拆成独立组件。
- 硬编码路径：
  - 用户数据目录硬编码为 `%APPDATA%\start-engineer`，合理。
  - Everything 下载 URL 固定在 `search-dependencies.ts`，应集中注明版本和升级策略。
- 魔法数字：
  - 轮询 1000/5000ms、TTL 800ms、启动子进程学习 800/1200ms、Toast 3500/7000ms、双击防抖 450ms 等散落在代码中。
  - 建议集中为常量并注明原因。
- 类型定义：
  - `src/shared/types.ts` 较完整。
  - `processAliases` 目前主要作为兼容字段保留，实际运行识别改为 `associatedPids`，建议注释说明，避免未来误用。
- 错误处理：
  - 配置损坏会备份。
  - 启动失败会返回错误码文案。
  - 结束进程会验证 PID、按需 UAC、失败抛错。
  - Everything 缺失会提示准备依赖。
  - 仍建议统一错误类型和用户文案。
- 可维护性：
  - 测试覆盖较好，包含偏好、搜索、运行监控、图标、批量操作、设置布局等。
  - 若要继续扩展正式产品，应优先拆分 `main.tsx` 和 `main.ts` 的大型控制器。

## 9. 数据存储与配置分析

- 应用列表：`%APPDATA%\start-engineer\apps.json`。
- 分组配置：`%APPDATA%\start-engineer\groups.json`。
- 偏好配置：`%APPDATA%\start-engineer\preferences.json`。
- 图标缓存：`%APPDATA%\start-engineer\icons\*.png`。
- Everything 自管依赖：`%APPDATA%\start-engineer\dependencies\everything\`。
- 用户自定义路径：
  - 应用 `executablePath`、`workingDirectory`、`launchArgs` 存在 `apps.json`。
- 窗口设置：
  - 当前代码中未发现窗口大小和位置持久化。
- localStorage：
  - 当前渲染层会写入 `start-engineer-ui-theme` 作为主题缓存。
- 数据库：
  - 当前未使用。
- Electron Store：
  - 当前未使用。
- 配置迁移：
  - 有 `migrateLegacyUserData()`，从旧 `commanddeck-next` 目录迁移。
  - 有 `normalizePreferences()`、`migrateAppEntry()`、`normalizeGroups()`。
- 配置损坏恢复：
  - `apps.json`、`groups.json`、`preferences.json` 读取失败时会备份为 `.corrupt-时间戳.bak` 并恢复默认。
- 卸载或升级：
  - 用户数据位于 `%APPDATA%`，通常安装包升级不会丢失。
  - 卸载是否清理用户数据取决于安装器行为；当前代码未发现卸载清理逻辑。

## 10. 错误处理与稳定性分析

- 应用路径不存在：已处理，启动前检查并提示。
- 应用启动失败：已处理，`launchErrorMessage()` 根据错误码返回中文提示。
- 权限不足：
  - 启动错误码 5 提示无权限。
  - 结束进程普通权限失败后按需 UAC。
  - 支持设置“以管理员方式启动”。
- 程序已经运行：启动前通过资源快照判断 `alreadyRunning`。
- 资源监控失败：渲染层会 Toast “资源监控刷新失败”。
- 配置文件读取失败：备份损坏配置并回退默认。
- 配置文件格式错误：同上。
- Windows API 调用失败：
  - 图标提取失败会 fallback。
  - Mica 设置失败会 CSS fallback。
  - PowerShell 失败会向上抛错。
- 打包后路径变化：
  - `app.isPackaged` 区分资源路径。
  - portable 登录项通过 `PORTABLE_EXECUTABLE_FILE` 处理。
- 用户删除应用：
  - 从 Start Engineer 移除应用不会删除本地程序。
  - 若外部删除 `.exe`，启动时提示路径不存在。
- 杀毒软件拦截：
  - 当前无法直接检测，仅会表现为启动失败或权限错误。
  - 未签名 EXE 可能被拦截，正式发布需签名。
- 中文路径或空格路径：
  - 启动参数通过 base64 JSON 传入 PowerShell，路径安全性较好。
  - Everything CSV 解码支持 GB18030 fallback。
- 非管理员权限运行：
  - 默认普通权限运行。
  - 结束高权限应用可能弹 UAC。

## 11. UI / 交互体验分析

- 主界面：
  - 侧栏 + 顶部搜索 + 主内容布局清晰，符合桌面工具结构。
  - Modern Utility 主题更像 Windows 工具，视觉密度较好。
- 应用卡片：
  - 支持图标、名称、勾选、运行绿点、启动中遮罩。
  - 卡片信息较简洁，适合启动器。
  - 建议增加路径失效、启动失败、管理员需求等状态标签。
- CPU/内存数据：
  - 进程页表格直观，支持排序和虚拟滚动。
  - 对普通用户来说 CPU/内存/磁盘足够。
- 搜索框：
  - 位置合理，支持 Everything 全局搜索和内部搜索。
  - 当前搜索范围切换在设置页，建议搜索框旁显示当前模式。
- 分组导航：
  - 进程入口和应用分组有分隔线，较清楚。
  - 默认分组命名如果面向外部用户需更通用。
- 按钮文案：
  - “一键启动”“关闭全部”“添加应用”自然。
  - “搜索依赖”对普通用户略技术化，后续可改成“文件搜索组件”或“本机文件搜索”。
- 空状态：
  - 应用/进程搜索空状态已有提示。
  - 首次启动的空分组引导还可加强。
- 错误状态：
  - Toast 自动消失，位置在操作栏上方。
  - 建议重要错误支持“查看详情/复制诊断信息”。
- 新手引导：
  - 当前未发现。
- 设置页面：
  - 已有折叠面板，功能完整。
  - 设置项增多后建议拆成“常规/搜索/外观/高级/关于”。
- 图标：
  - 应用图标和托盘图标已统一。
  - 应用图标提取策略较好。
- 窗口缩放：
  - 设置了 `minWidth: 1060`、`minHeight: 680`，小屏可用但布局仍需持续测试。


## 12. 打包后体验分析

- 启动速度：
  - Electron 启动速度通常慢于原生应用。
  - 当前首屏先加载配置，再异步刷新资源和图标，策略合理。
- 体积：
  - 约 82 MB，Electron 正常但不算轻。
- 安装包：
  - 已支持 NSIS 安装包。
- 绿色版：
  - 已支持 portable。
- 自动更新：
  - 当前未支持。
- 签名证书：
  - 当前 `signAndEditExecutable: false`，未签名。
- Windows Defender：
  - 未签名、会启动/结束进程、会下载 Everything 依赖，存在被提示或拦截的可能。
- 图标：
  - `build/icon.ico` 已用于窗口、安装包、可执行文件。
- 应用名称：
  - `productName`、`executableName`、shortcutName 已为 `Start Engineer`。
- 任务栏显示：
  - 窗口标题和图标应显示为 Start Engineer。
- 卸载：
  - NSIS 支持卸载程序。
  - 当前未发现卸载时清理 `%APPDATA%\start-engineer` 的逻辑。
- 用户数据：
  - 升级通常保留。
  - 从旧 `commanddeck-next` 有迁移逻辑。

## 13. 安全性分析

- 是否允许启动任意路径：
  - 当前用户可选择任意 `.exe`，这是启动器功能本身。
  - 风险在于误添加恶意程序；建议后续显示完整路径并支持打开所在位置确认。
- 是否可能执行危险命令：
  - 启动应用走 `Start-Process`。
  - 结束进程走 `taskkill /T /F`。
  - 这些操作本身具有风险，但都在用户显式操作或确认后执行。
- 是否暴露 Node.js 给前端：
  - `nodeIntegration: false`，`contextIsolation: true`，未直接暴露 Node。
- preload 是否安全：
  - `preload.cts` 只暴露白名单 IPC 方法。
  - 建议继续保持输入校验在主进程，不信任渲染层。
- IPC 通信限制：
  - API 方法明确，但部分 IPC 仍接受字符串路径或 ID，需要主进程持续校验。
- 命令注入风险：
  - 多数 PowerShell 操作使用 base64 JSON 或 `execFile` 参数数组。
  - `expandZip()` 中 PowerShell 字符串对单引号做了转义。
  - 当前未发现明显字符串拼接命令注入，但仍建议为所有 PowerShell 入口建立统一编码工具。
- 路径注入风险：
  - `shell.openPath`、`showItemInFolder` 前检查 `existsSync`。
  - 启动路径来自用户选择 `.exe`，基本可控。
- 不必要系统权限：
  - 默认普通权限运行。
  - 管理员模式是用户可选。
- 外部网络请求：
  - 仅搜索依赖一键准备时从 voidtools 下载 Everything 和 ES。
  - 当前未发现其他联网或遥测。
- 隐私数据收集：
  - 当前未发现遥测或上传用户数据。
  - Everything 搜索在本机执行。

## 14. 优化建议清单

### 高优先级

| 建议 | 问题描述 | 为什么要改 | 建议怎么改 | 涉及文件 | 难度 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 开始菜单/桌面快捷方式导入 | 首次使用仍需手动找 `.exe` | 减少用户操作最大 | 扫描 `.lnk`，解析目标，提供候选导入 | 新增 `src/main/app-discovery.ts`，修改 `src/main/main.ts`、`src/renderer/main.tsx` | 中 | 高 |
| 路径失效状态 | 路径不存在只在启动时提示 | 用户看不到问题来源 | 卡片显示“路径失效”，提供“重新选择” | `src/main/main.ts`、`src/renderer/pages.tsx`、`styles.css` | 中 | 高 |
| 资源监控降负载 | PowerShell 全量采集成本较高 | 降低后台 CPU 与卡顿 | 后台/托盘暂停或降频；应用页只采已管理应用 | `src/renderer/main.tsx`、`src/main/runtime-monitor.ts`、`src/main/main.ts` | 中 | 高 |
| 统一错误模型 | 系统错误文案不够稳定 | 用户更容易自助处理 | 定义错误码和用户文案，Toast 支持详情 | `src/shared/types.ts`、`src/main/main.ts`、`src/renderer/main.tsx` | 中 | 高 |
| 应用运行识别诊断 | 复杂启动器可能误判 | 避免“显示运行但实际没开” | 增加应用详情里的匹配 PID、路径、最后识别来源 | `runtime-monitor.ts`、`pages.tsx` | 中 | 高 |
| 窗口大小位置记忆 | 当前未发现持久化 | 桌面应用基础体验 | 保存 bounds，启动恢复，处理多屏越界 | `src/main/main.ts`、`preferences.ts` | 低 | 高 |
| 低文字密度状态表达 | 新增状态容易让卡片堆满文字 | 保持轻便、人性化和一眼可读 | 用状态灯、角标、Tooltip、详情抽屉替代卡片长文案 | `pages.tsx`、`styles.css`、设置页组件 | 低 | 高 |

### 中优先级

| 建议 | 问题描述 | 为什么要改 | 建议怎么改 | 涉及文件 | 难度 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 拆分 `main.tsx` | 渲染控制器过大 | 后续功能会越来越难维护 | 拆成 AppShell、SearchBar、SettingsPage、Menus、Dialogs、hooks | `src/renderer/main.tsx` | 中 | 中 |
| 拆分 `main.ts` | 主进程入口过大 | 降低回归风险 | 拆 app-store、groups-service、launch-service、window-service、ipc-register | `src/main/main.ts` | 中 | 中 |
| 设置页信息架构 | 设置项持续增加 | 降低视觉拥挤 | 拆“常规/搜索/外观/高级/关于” | `main.tsx`、`styles.css` | 中 | 中 |
| 搜索模式可见 | 当前搜索范围只在设置中看 | 避免用户误解 Everything/内部搜索 | 搜索框旁显示“文件/内部”切换胶囊 | `main.tsx`、`styles.css` | 低 | 中 |
| 导入常见应用推荐 | 默认分组空时体验弱 | 降低首次配置成本 | 首次启动提供推荐扫描 | 新增 discovery 模块 | 中 | 中 |
| 低功耗模式 | 长期开启监控可能耗电 | 符合轻量目标 | 设置页增加监控频率选项 | `preferences.ts`、`main.tsx`、`runtime-monitor.ts` | 中 | 中 |
| 配置导入导出 | 用户升级/换机需要迁移 | 增强可维护性 | 导出/导入 JSON + icons | `main.ts`、设置页 | 中 | 中 |

### 低优先级

| 建议 | 问题描述 | 为什么要改 | 建议怎么改 | 涉及文件 | 难度 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 关于页面 | 当前未发现版本展示 | 正式产品需要 | 显示版本、数据目录、依赖状态、复制诊断 | 设置页 | 低 | 低 |
| 自动更新 | 当前未支持 | 面向外部发布需要 | 接入 electron-updater 或自定义更新 | `package.json`、主进程 | 高 | 低 |
| 代码签名 | 当前未签名 | 降低安全提示 | 购买证书并配置 electron-builder | `package.json` | 中 | 低 |
| 更细主题自定义 | 当前只有固定主题 | 提升个性化 | 增加强调色选项 | `theme.ts`、`styles.css` | 中 | 低 |
| 动画微调 | 当前已有基础动效 | 提升精致感 | 只优化低频区域，避免影响性能 | `styles.css` | 低 | 低 |
| 图标缓存清理 | 图标缓存可能积累 | 长期维护更干净 | 设置页增加清理按钮 | `main.ts`、设置页 | 低 | 低 |

## 15. 建议的后续开发路线图

### 第一阶段：让程序更好用

目标：减少用户操作，提高基础体验。

- 增加开始菜单/桌面快捷方式导入。
- 增加常见应用自动识别和推荐导入。
- 默认启用开机自启、关闭到托盘和管理员运行，并允许用户在设置中手动关闭或调整。
- 当前自用阶段优先完善便携版体验，确保双击即可稳定使用。
- 增加路径失效卡片状态和一键重新选择。
- 建立低文字密度状态视觉语言，用绿灯、警告角标、盾牌图标、Tooltip 和详情抽屉替代卡片长文案。
- 搜索框显示当前搜索模式，并允许快速切换。
- 设置页增加“打开数据目录”“复制诊断信息”。

### 第二阶段：让程序更稳定

目标：完善错误处理、配置存储、资源监控。

- 统一错误类型和用户文案。
- 优化复杂启动器运行状态识别，暴露诊断信息。
- 增加监控低功耗模式。
- 增加配置导入/导出。
- 增加窗口大小和位置记忆。
- 为 PowerShell 采集失败提供降级和恢复提示。

### 第三阶段：让程序更像正式产品

目标：完善桌面应用发布体验。

- 增加关于页和版本信息。
- 面向其他用户发布时，同时提供便携版和安装版。
- 增加联网自动更新能力。
- 配置代码签名。
- 优化 NSIS 卸载行为和用户数据保留提示。
- 增加系统通知或可选通知。
- 整理首次启动引导。

### 第四阶段：进一步轻量化和长期维护

目标：减少依赖、优化性能、整理代码结构。

- 评估原生进程采集替代 PowerShell。
- 拆分 `src/main/main.ts` 和 `src/renderer/main.tsx`。
- 集中魔法数字和配置常量。
- 增加性能基准测试。
- 评估是否长期保持 Electron，或在明确轻量需求下探索 Tauri/Wails 重构。

## 16. 已确认的产品决策与未来计划

以下内容已由项目 owner 人工确认，可作为后续开发和 AI 接手时的产品决策基准。

### 16.1 已确认决策

- 最终定位：Start Engineer 未来准备分享给其他用户使用，不只是个人自用工具。
- 当前发布形态：当前仍是自用阶段，只需要优先维护便携版；未来面向其他用户发布时，再同时提供便携版和安装版。
- 开机自启：希望默认开启，但必须在设置中提供开关，允许用户手动关闭或重新开启。
- 关闭行为：默认关闭到系统托盘，但必须在设置中提供选项，允许用户改为直接退出。
- 首次导入：允许首次启动时扫描开始菜单和桌面快捷方式，用于减少手动添加 `.exe` 的操作。
- Everything 依赖：允许 Start Engineer 自动下载 Everything 便携版依赖，减少用户额外安装和配置。
- 视觉方向：先保持当前 Windows 工具风格，不切换到游戏启动器风格，也不进行大规模视觉重做。
- 体积取舍：当前接受 Electron 带来的约 80 MB 级体积，未来再考虑进一步轻量化。
- 权限策略：管理员运行设为常用模式，但仍应保持用户可控，避免静默高权限行为。

### 16.2 暂缓到未来计划

- 游戏账号管理、启动参数模板、多账号配置：当前暂不需要，列入未来计划改进点。
- 多用户配置、多套启动方案：当前暂不需要，列入未来计划改进点。
- 联网自动更新：未来需要；当前自用版暂不实现，列入公开发布前的计划。
- 深度轻量化：当前先接受 80 MB 级体积，未来再评估 Electron 体积优化或其他桌面框架方案。

### 16.3 对后续开发的影响

- 默认偏好应向“常驻、自动、少操作”倾斜：默认开机自启、关闭到托盘、管理员常用模式。
- 首次体验优先级很高：下一阶段应优先实现开始菜单/桌面快捷方式扫描导入，而不是继续增加复杂高级功能。
- 面向公开发布前，需要补齐安装版体验、签名、自动更新、关于页和更完整的新手引导。
- 所有自动能力仍要遵守安全可控原则：扫描、下载依赖、管理员权限和批量结束进程都要有清晰入口和用户可见状态。

## 17. 附录：关键文件摘要

- `D:\Code\Start Engineer\package.json`
  - 定义脚本、依赖、Electron 主入口、electron-builder 配置、产品名 `Start Engineer`、appId `com.essppao.startengineer`。
- `D:\Code\Start Engineer\src\main\main.ts`
  - 主进程总入口，负责窗口、托盘、配置文件、IPC、应用启动/关闭、资源采集、Everything 依赖、全局快捷键、管理员重启。
- `D:\Code\Start Engineer\src\preload\preload.cts`
  - 安全暴露 `StartEngineerApi` 到渲染层，使用 `ipcRenderer.invoke` 与主进程通信。
- `D:\Code\Start Engineer\src\shared\types.ts`
  - 共享类型定义，包括应用、分组、偏好、快照、搜索、批量操作和 API。
- `D:\Code\Start Engineer\src\main\runtime-monitor.ts`
  - 运行时快照聚合模块，负责 TTL、single-flight、进程指标差分、应用匹配和进程表聚合。
- `D:\Code\Start Engineer\src\main\process-termination.ts`
  - 进程结束模块，负责 PID 清洗、`taskkill` 参数和普通/管理员结束流程。
- `D:\Code\Start Engineer\src\main\preferences.ts`
  - 默认偏好与偏好归一化，包括开机启动、关闭行为、快捷键、主题、管理员模式、搜索提供方、运行应用置顶。
- `D:\Code\Start Engineer\src\main\everything-search.ts`
  - Everything CLI 搜索实现，构造 `ES.exe` 参数并解析 CSV 输出。
- `D:\Code\Start Engineer\src\main\search-dependencies.ts`
  - Everything/ES 自管依赖检测、下载、解压和状态描述。
- `D:\Code\Start Engineer\src\main\config-migration.ts`
  - 应用与分组旧配置迁移。
- `D:\Code\Start Engineer\src\main\user-data-migration.ts`
  - 从旧用户数据目录迁移到 `%APPDATA%\start-engineer`。
- `D:\Code\Start Engineer\src\main\administrator-launch.ts`
  - 管理员权限重启请求构造和状态判断。
- `D:\Code\Start Engineer\src\renderer\main.tsx`
  - 渲染层主控制器，包含数据加载、轮询、搜索、菜单、弹窗、设置页、拖拽、启动反馈等。
- `D:\Code\Start Engineer\src\renderer\pages.tsx`
  - 进程页和应用分组页组件；进程列表使用轻量虚拟滚动。
- `D:\Code\Start Engineer\src\renderer\styles.css`
  - 视觉系统和四套主题样式，覆盖侧栏、顶部栏、卡片、进程表、设置页、菜单、Toast 和弹窗。
- `D:\Code\Start Engineer\src\renderer\search.ts`
  - 内部搜索匹配逻辑。
- `D:\Code\Start Engineer\src\renderer\app-display.ts`
  - 应用显示排序，支持运行应用置顶。
- `D:\Code\Start Engineer\src\renderer\card-click.ts`
  - 应用卡片单击/双击防误触辅助逻辑。
- `D:\Code\Start Engineer\scripts\smoke.mjs`
  - 生产构建 Electron 烟测脚本。
- `D:\Code\Start Engineer\build\icon.ico`
  - Windows EXE、安装包和窗口图标。
- `D:\Code\Start Engineer\build\tray-icon.png`
  - 系统托盘图标。
- `D:\Code\Start Engineer\release\Start-Engineer-Setup-0.1.0.exe`
  - 当前安装版产物。
- `D:\Code\Start Engineer\release\Start-Engineer-Portable-0.1.0.exe`
  - 当前便携版产物。
