# PROJECT_OPTIMIZATION

本文档基于当前仓库 `D:\Code\Start Engineer` 的真实代码整理，面向后续接手的 AI / 开发者。它不是普通用户说明书，也不是营销介绍；目标是帮助后来者快速理解 Start Engineer 现在做到了什么、核心路径在哪里、哪些地方容易踩坑，以及下一步应该怎样优化。

请以后续实际代码为准，尤其是 `src/shared/types.ts`、`src/main/main.ts`、`src/renderer/main.tsx`、`src/main/window-manager.ts`、`native/window-focus-helper/Program.cs`。本文只把代码中已经存在的能力写为“当前能力”；尚未落地的设想会明确放在“风险 / 建议 / 路线图”中。

最后核对日期：`2026-08-19`。当前代码基线已包含轻量化发布体积治理和统一 Wake Engine。既有合并卡片键盘交互、透明图标提取、快捷方式拖入、右键菜单视口适配、“普通权限主界面 + 会话级高权限进程控制”、渐进披露设置页和多主题外观继续保留；Wallpaper Glass 与 Clear Desktop 自身保持独立。主界面默认保持普通权限；关闭应用先尝试普通 `taskkill`，只有确认目标仍在运行时才按需请求 UAC，授权成功后由隐藏的受限 helper 完成关闭并在本次会话复用。Microsoft Store / MSIX 应用使用稳定 AUMID 作为启动身份，旧 WindowsApps 版本路径会在首次启动时原位迁移。首次启动在后台按默认模板筛选少量候选，只自动添加当前电脑已确认存在的应用；缺失项静默跳过。设置页默认只显示“启动与操作”、当前外观摘要和折叠的高级设置，分组管理位于独立页签，“关于”保持低强调弹窗入口。搜索服务会保留最近实际返回给界面的有限候选快照，避免多个异步查询乱序完成后覆盖当前候选 ID，导致用户对仍可见的开始菜单或 Store 结果按 Enter 时错误提示“未找到该应用候选”。多应用卡片现在可以整卡拖入另一张多应用卡片：目标卡片保留名称和位置，源卡片成员按原顺序追加并随源卡片一起收起；悬停吸附、整组图标收缩和成功回弹共同表达合并过程，自身目标及卡片边缘误触不会触发合并。Wake Policy / Profile 统一决定普通窗口、Self Launch 与 AUMID 激活路径；默认未知应用只查找窗口，微信与 Notion 只允许恢复当前可见或任务栏最小化的窗口，托盘隐藏窗口会在任何恢复动作前被拒绝并提示用户手动打开，窗口缓存与右键窗口列表也不能绕过；MuMu / WeGame 只发送一次自唤醒请求，Codex 与 Store 应用完成一次激活后只观察窗口而不再次强制聚焦。应用编辑器的高级设置允许用户覆盖自动策略，诊断 JSON 会记录所选 Profile、策略、候选窗口、恢复结果、失败原因及外部操作次数。轻量化后 helper 从 154.19 MiB 降至约 14.05 MiB；本轮完整测试为 91 个测试文件 / 432 项测试，生产构建和交付包结果见本轮最终验证记录。

补充核对日期：`2026-08-20`。本轮 P0 治理已引入安全首屏缓存、启动阶段标记、统一应用生命周期状态、分级运行采样和更稳定的窗口候选选择；上段 `2026-08-19` 代表此前 Wake Engine / 轻量化基线，不再是最新验证日期。

补充核对日期：`2026-08-23`。本轮 P1 已把运行快照调度迁入 `use-runtime-polling.ts`，把启动、唤起、关闭和批量动作迁入 `use-app-actions.ts`，并由 `use-app-runtime-actions.ts` 统一防重与过期结果隔离。`main.tsx` 从约 1478 行降至约 1215 行。应用动作错误统一归一化为稳定错误码、短用户文案和独立诊断字段；Wake Engine 增加固定窗口样本与并发 stale request 回归。最终构建、打包和校验和见 `11.2`。

补充核对日期：`2026-08-24`。低频且不完整的“进程”一级模块已从产品界面移除，同时删除进程页、进程右键菜单、内部进程搜索和 renderer 全量快照请求。应用运行识别、窗口唤醒、应用级关闭、批量关闭、运行指标与本地诊断仍由底层 Runtime / Wake Engine 提供；旧首屏缓存若保存 `processes` section，会自动回落到首个用户应用分组。详情与最终验证见 `11.3`。

维护硬性约定：每次代码、配置、样式、测试或构建流程发生改动，都必须在同一提交中同步更新本文档，至少记录受影响能力、验证结果或新的维护注意事项，避免文档再次落后于实际代码。

发布硬性约定：每次完成改动并通过必要验证后，都必须重新生成 Windows 安装版和便携版，确保 `release` 中的交付文件与当前代码一致。

构建洁净度约定：`npm run build` 必须先删除仓库内的 `dist`、`dist-electron` 与 `dist-native`，再编译并执行产物检查；`electron-builder` 还会显式排除 `*.test.*` / `*.spec.*` 和 helper PDB。窗口 helper 以 win-x64、.NET 8 Core 自包含、partial trim 单文件发布；仅通过独立 `System.Drawing.Common` 保留图标编码，不得重新启用会捆绑 WinForms/WPF 的 `UseWindowsForms`。因此用户不必预装 .NET 运行时，同时避免整套 Windows Desktop Runtime 进入发布包。这些约束避免历史测试 JavaScript、已删除模块、调试符号、本机源码路径或 framework-dependent helper 被收入公开包。清理脚本必须校验目标仍位于项目目录内，不得把可变路径直接交给递归删除。

发布目录洁净度约定：Windows 打包前必须运行 `scripts/clean-release-output.mjs`，只删除 `release` 下 Start Engineer 的版本化 EXE / blockmap、builder 元数据、校验和与 `win-unpacked*` 目录，保留任何不认识的文件并校验删除目标没有越出 `release`。`release:prepare` 和 GitHub Release 工作流复用已经通过验证的生产构建，再执行 artifact-only 打包，避免 self-contained helper 被重复构建而挤压 Actions 超时时间；本地普通与签名打包入口仍会先关闭运行中的 Start Engineer。

GitHub Actions 供应链约定：`checkout`、`setup-node`、`setup-dotnet`、`upload-artifact` 与 `download-artifact` 必须固定到 GitHub 官方仓库已核验的完整 commit SHA，并在行尾保留对应语义版本注释；Dependabot 负责后续更新。不要为了写法简短退回浮动的 `@v4` 标签。`workflow_dispatch` 只用于生成 Actions Artifact；只有 `push` 事件中的匹配 `v*` 标签才允许进入草稿 Release job，避免手动选择标签运行工作流时意外创建发布记录。

发布依赖基线为 Node.js `>=22.12.0`、Electron `43.3.0`、electron-builder `26.15.3`、Vite `8.2.1`、Vitest `4.1.10` 与 `@vitejs/plugin-react` `6.0.5`。`package-lock.json` 的下载地址必须全部指向官方 `registry.npmjs.org`，根级 `postinstall` 显式下载 Electron 运行时；electron-builder 的 `electronDist` 直接复用这份已安装运行时，不能再从 GitHub 重复下载同版本压缩包。React / React DOM 只作为 Vite 构建依赖，不能作为生产依赖重复进入 `app.asar`；其 MIT 文本由 `licenses/REACT_LICENSE.txt` 单独随包保留。Electron 仅携带 `zh-CN` 与 `en-US` 回退语言。`scripts/after-pack.cjs` 会在打包后定点移除该目录自带但应用不使用的 `default_app.asar`、`version` 与 `app-update.yml`，并验证目标仍位于当前 `appOutDir`。2026-08-08 从空 `node_modules` 执行 `npm ci` 成功，Electron 二进制为 `v43.3.0`，官方 `npm audit --audit-level=moderate` 返回 0 个漏洞。依赖再次变更后必须重新做同样检查。

helper 构建冒烟在 GitHub CI 中是强制门槛；`scripts/smoke-window-helper.mjs` 会真实覆盖 `is-elevated`、窗口扫描/聚焦、进程快照、快捷方式 COM、Shell 图标、隐藏启动与常驻 JSON Lines 协议。本地受限执行沙箱若明确返回 `EPERM`，脚本会记录警告并只跳过执行步骤，仍检查单文件和无 PDB。普通开发机的其他失败、无效 JSON 或非零退出码仍会使构建失败；正式候选包还必须在干净 Windows x64 环境验证 Store 图标与 UAC 终止握手。helper 项目必须保持 `BuiltInComInteropSupport=true` 并把自身声明为 trimmer root；删除任一项都会破坏快捷方式或 Shell 图标。还必须关闭 .NET SDK 的源码 revision 自动追加，使 `ProductVersion` 与应用公开版本一致，而不是暴露内部 Git 提交哈希。

公开源码隐私约定：测试夹具使用 `ExampleUser` 等虚构用户名，不新增真实 Windows 用户目录。既有 Git 历史曾出现本机用户名；公开仓库前需由所有者决定接受历史暴露，或单独授权执行一次经过备份与复核的历史重写，常规发布准备不得擅自改写远程历史。

## 1. 项目定位与当前状态

Start Engineer 当前是一个 Windows 桌面启动台与任务栏辅助入口。项目面向 Windows 10/11，使用 Electron + React + TypeScript 实现，并带有一个 Windows-only C# 窗口聚焦 helper。

当前核心能力：

- 按用户分组管理应用。
- 一级系统入口只保留 `已添加应用` 与 `设置`；用户应用分组位于两者之间。
- `已添加应用` 是聚合视图，Microsoft Store 应用优先按 AUMID、普通应用按 `executablePath` 去重显示全部已添加应用，并保存独立排序。
- 添加、修改、移动、删除应用。
- 支持通过文件选择器、搜索候选、拖入 `.exe` 或 `.lnk` 添加应用。
- 搜索框可搜索已添加应用、本机可添加应用、安全下载入口；没有应用结果时才显示 Everything 文件兜底结果。
- 本机应用搜索采用最近结果快照保护：快速连续输入或异步查询乱序完成时，界面中仍可见的候选仍能通过 Enter / `+` 正常添加；快照有固定数量上限，添加普通 EXE 时仍由主进程复核文件存在性。
- Everything 一键准备固定下载官方 1.4.1.1032 x64 Portable 与 ES 1.1.0.37 x64；两个 ZIP 都必须通过内置 SHA-256 后才允许解压和启动。
- 首次启动会在后台扫描 Microsoft Store / MSIX、开始菜单和桌面快捷方式，按默认模板与分组自动添加当前电脑可用的少量应用。
- 首次自动导入不显示额外选择界面；模板中未在当前电脑发现的应用会被静默跳过，不写入失效配置。
- 支持发现 Microsoft Store / MSIX 应用并保存稳定 AUMID；包版本目录变化时自动解析当前安装位置、保留原卡片 ID/名称/分组并通过原生 Windows 激活接口启动。
- 应用卡片支持鼠标和键盘操作：选择、启动、唤起、右键菜单、编辑和拖拽排序。
- 应用编辑器的“高级设置”可以把自动推荐的唤醒方式改为仅查找窗口、重新运行以唤醒或使用 Windows 应用身份唤醒；高风险 Self Launch 会明确提示可能产生第二实例。
- 应用右键菜单会在内容或窗口尺寸变化时自动贴合视口边界；长菜单限制在窗口内独立滚动，底部操作不会再落到不可见区域。
- 支持将应用拖到另一个应用或既有多应用卡片中，也支持把整张多应用卡片拖入另一张多应用卡片，将全部成员一次合并；成员应用从外层网格隐藏，多应用卡片与普通卡片统一排序并可跨分组移动。
- 多应用卡片支持单击或 Enter 原位放大、双击或默认 `Ctrl+Enter` 启动全部成员；成员可从放大卡片拖回外层、转移到其他卡片或移动到其他分组。
- 支持方向键 / WASD 网格导航，Enter 执行普通应用主操作或展开合并卡片，Esc 分层退出。
- 应用内快捷键可以录制、冲突校验、立即生效和恢复全部默认；默认支持相邻分组切换及 `Ctrl+1` 到 `Ctrl+9` 直达前九个用户分组。
- 支持关闭单个应用、一次关闭多应用卡片成员、关闭当前视图或全部运行应用。
- 支持运行状态识别，运行指标包含 `matchedPids`、`associatedPids`、`matchedProcessNames`、`matchedPaths`。
- 支持同一程序出现在多个用户分组时同步运行绿点。
- 支持原生窗口扫描 / 聚焦 helper，PowerShell 作为 fallback。
- 支持统一 Wake Policy / Profile：普通应用默认只聚焦既有窗口，Codex 可执行一次 Self Launch，Store 应用可执行一次 AUMID 激活，MuMu / WeGame 只发送一次应用自身唤醒请求，微信与 Notion 托盘态保持安全失败并提示用户手动打开；激活后的扫描仅用于观察，不能再次强制聚焦。
- 支持全局快捷键唤出 / 隐藏主窗口。
- 支持开机自启、关闭到托盘、托盘菜单。
- Electron 主界面默认保持普通权限，资源管理器可原生拖入 `.exe` / `.lnk`；关闭操作先尝试普通权限，只有目标 PID 仍在运行时才按需触发 UAC。授权成功后，本次运行复用受限 native helper，不再反复弹出 UAC。helper 始终隐藏控制台窗口，并在 GUI 退出或管道断开后自动退出。
- 支持窗口大小和位置记忆。
- 支持 Splash Window，降低双击 EXE 后的空白等待感。
- 主窗口启用 Chromium sandbox、context isolation 与禁用 Node integration；主进程拒绝渲染层导航、新窗口和所有网页权限请求，页面 CSP 禁止对象、frame、表单和外部默认资源。主题预加载已移到同源静态脚本，`script-src` 不需要 `unsafe-inline`；对外网页只允许走受约束的主进程 `shell.openExternal` 入口。
- `Apple Gallery`、`Fluent Workspace`、`Midnight Control`、`Modern Utility`、`Refined Glass` 参照 Wallpaper Glass 共用同一套玻璃外观和交互层级，只保留配色差异；`Wallpaper Glass` 原有背景、按钮与融合强度链路保持不变，`Clear Desktop` 继续作为独立透明主题。
- `Wallpaper Glass` 支持深色/浅色变体和 0-100 数值融合强度，滑条拖动时实时预览。
- 支持受约束 UI 编辑：整体缩放、自定义背景色、卡片大小、网格密度、侧栏宽度、顶部图标大小、背景色调，以及名称/搜索栏/运行状态/底部操作的显示开关。
- 支持 UI 分享码 `seui:v1:...` 导入导出。
- 设置页默认使用“偏好 / 分组管理”双页签；偏好首页只常显启动与操作、当前外观摘要和折叠的高级设置，完整主题、界面编辑器、应用内快捷键与搜索依赖均按需展开。
- 设置顶栏不显示与设置任务无关的全局搜索框；`Ctrl+F` 在设置页不会误聚焦隐藏输入框。
- “关于 Start Engineer”降为设置页页脚的低强调入口；弹窗读取真实应用/运行时/Windows 版本，可打开数据目录、项目主页并复制不包含应用列表或配置内容的诊断摘要，支持遮罩、Esc、焦点循环与焦点恢复。
- 首次导入 QA 标记只允许未打包开发构建使用；安装版和便携版即使用户数据目录误留标记也会忽略，不能切换到隐藏测试配置。
- 支持应用卡片拖拽排序、拖到侧栏移动分组，以及设置页分组拖拽排序。
- 普通分组页顶部只显示分组名称，不显示容易与合并卡片成员数混淆的应用数量；聚合应用和设置页仍按各自任务显示副标题。

当前验证与打包脚本：

- `npm run electron:install`
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke:helper`
- `npm run clean:release`
- `npm run smoke`
- `npm run package:win`
- `npm run verify:footprint`
- `npm run release:checksums`
- `npm run release:verify`
- `npm run release:prepare`

`npm run build` 会通过 `scripts/clean-build-output.mjs` 清除上一轮 Web / Electron 编译目录，并在完成后用 `scripts/verify-build-artifacts.mjs` 确认关键入口存在且没有测试产物；公开包不能依赖开发者手动清理旧文件。

Electron 43 的 npm 包不再自行声明 `postinstall` 下载运行时；项目顶层 `postinstall` 会显式执行 `install-electron`，首次 `npm install` / `npm ci` 必须完成该步骤。若企业网络拦截 GitHub Release 下载，应明确配置 Electron 官方支持的镜像或缓存，不能提交缺少 `node_modules/electron/dist` 的“成功安装”状态。

`npm run package:win` 会先执行 `scripts/close-running-app.mjs`：同时通过 `tasklist` 和 PowerShell 进程查询识别安装版、便携版及临时目录中的 Start Engineer 实例，优先正常结束，必要时按 PID 强制结束；仍有高权限残留时会请求管理员权限。预检确认程序完全退出后才开始覆盖 `release` 产物，避免打包文件被占用。

`package:win:artifacts` / `package:win:artifacts:signed` 是给已完成 `npm run build` 的 Release 流水线复用的内部入口：它们会先定点清理旧发布产物，但不会再次编译。日常手工打包仍使用 `package:win` 或 `package:win:signed`，不要直接用 artifact-only 入口代替构建验证。

每次 Windows 打包结束都会运行 `scripts/verify-package-footprint.mjs`：helper 不得超过 20 MiB，安装版和便携版各不得超过 110 MiB，语言包必须精确为 `zh-CN` / `en-US`，`app.asar` 不得再次出现生产 `node_modules`。这些是防止依赖或打包配置回退的硬门槛；确有必要调整预算时，必须先解释新增体积来源并更新本文档。

当前打包配置：

- 包名：`start-engineer`
- 产品名：`Start Engineer`
- appId：`com.essppao.startengineer`
- 输出目录：`release`
- 安装包：`release/Start-Engineer-Setup-0.1.0.exe`
- 便携版：`release/Start-Engineer-Portable-0.1.0.exe`
- 默认 `package:win` 启用可执行文件资源编辑、写入 `asInvoker` 并显式构建 x64，使安装后的主 EXE 带 Start Engineer 产品元数据且主界面不会自行提权；没有证书时仍是 Authenticode 未签名。`package:win:signed` 保留显式签名入口，GitHub Release 工作流只有检测到 `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD` Secrets 时才调用它。
- `electron-builder.extraResources` 会把 `dist-native/window-focus-helper/win-x64` 打进资源目录。
- 当前没有应用内自动更新，因此 NSIS 关闭 `differentialPackage`，让安装版与便携版复用更高效的归档；未来接入差分更新时必须重新测量体积并恢复相应 blockmap 流程。
- Electron 语言包只保留 `zh-CN.pak` 与 `en-US.pak`；不要删除 `resources.pak`、ICU、GPU / SwiftShader、FFmpeg 或 Chromium 许可证文件来追求表面体积，这些文件关系到玻璃渲染、Unicode、远程桌面兼容与许可证合规。
- `electron-builder.files` 对 `dist-electron` 的测试/规格文件做防御性排除；即使未来构建流程回归，也不能把测试 JavaScript 带入 `app.asar`。
- 自包含 helper 的产品/文件版本跟随 `package.json`，公开包同时携带 `THIRD_PARTY_NOTICES.md` 和 .NET Runtime MIT 许可证；升级目标框架或 runtime pack 时要同步上游第三方声明链接并复核许可证。
- `release:checksums` 为安装版与便携版生成 `release/SHA256SUMS.txt`；公开 Release 必须同时附带该文件。

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
- 特殊应用只能通过集中式 Wake Profile 选择受控激活策略；策略必须明确、可测试、可诊断，并保持一次点击最多一次外部状态改变。

### 2.3 轻量优先

启动台首先要“出现得快、操作不粘、后台安静”。当前已有 Splash、启动后延迟刷新图标、仅采 managed 运行快照和按可见性/空闲时间自动降频等优化。后续仍应继续：

- 首屏优先展示应用和分组。
- Everything 与图标刷新应延后或后台处理；renderer 正常路径不得恢复 full 进程快照。
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

- Electron 43
- React 18
- TypeScript 5
- Vite 8
- Vitest 4
- electron-builder 26
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

`src/renderer/main.tsx` 是渲染层组合入口。当前已迁出完整设置页、设置偏好控制器、设置页分组拖拽、搜索请求状态机、外部应用拖入、统一网格拖拽、运行快照轮询、应用动作控制器、快捷键设置、搜索结果、应用编辑、右键菜单、通用弹层、分组管理组件和通用图标，但以下职责仍然集中：

- 加载分组、应用、偏好。
- 系统 section 和用户 section 切换。
- 搜索结果动作与搜索框焦点恢复。
- 键盘导航和焦点恢复。
- 旧聚合视图应用卡片拖拽排序和移动分组。
- 多应用卡片放大；统一网格拖拽、成员迁移、混合排序与启动/关闭反馈已迁入独立 hook。
- 主题属性和 UI layout 属性写入 `document.documentElement.dataset`。

`src/renderer/pages.tsx` 包含普通分组与统一混合网格页面，负责应用卡片、多应用卡片、底部操作栏和卡片交互。旧 `ProcessPage` 已随低频进程模块删除。

渲染层后续建议拆分：

- `AppShell`
- `Sidebar`
- `TopbarSearch`
- `GroupPage`
- `AllAppsPage` 或聚合视图 hook
- `SettingsPage`（已完成）
- `SearchPanel`
- `ContextMenus`
- `Dialogs`
- `ImportWizard`
- `useRuntimePolling`（已完成）
- `useAppActions`（已完成）

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

- `SystemSectionId = "all-apps" | "settings"`
- `SectionId = SystemSectionId | string`

当前语义：

- `all-apps`：系统聚合应用视图，不写入 `groups.json`。
- 用户分组：来自 `groups.json`，可重命名、删除、拖拽排序。
- `settings`：设置页。

注意：

- `all-apps` 不是普通用户分组，但当前实现允许在该视图内拖拽排序，排序保存到 `preferences.allAppsView.orderedAppIds`。
- `all-apps` 会先应用独立排序，再按 AUMID（Store 应用）或归一化后的 `executablePath`（普通应用）去重；同一个应用出现在多个用户分组时只显示一个代表卡片。
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
- `appUserModelId`
- `launchedPid`
- `processAliases`
- `associatedPids`

注意：

- `associatedPids` 已存在于类型中，但当前代码主要用 `runtimeAssociatedPids` 做运行期关联 PID，避免把复杂启动器的临时子进程永久污染到配置。
- `appUserModelId` 是 Microsoft Store / MSIX 应用的稳定身份，例如 `OpenAI.Codex_2p2nqsd0c76g0!App`。`executablePath` 对这类应用只保存当前可解析到的真实路径，可能随包版本更新或为空，不能再被当作启动身份；禁止把 `shell:AppsFolder\...` 伪路径写进该字段。

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
- 普通关闭先执行普通 `taskkill`；确认目标 PID 仍在运行后，若 helper 尚未授权则由当前关闭操作请求一次 UAC，随后再发送受限 PID 终止请求。用户取消 UAC 时明确提示应用未关闭；授权成功后，本次运行继续复用同一 helper。
- helper 的 `terminate-server` 通过原生 `hidden` 启动标记运行；`ShellExecuteExW` 使用 `SW_HIDE`，普通 `CreateProcessW` 隐藏路径同时使用 `STARTF_USESHOWWINDOW + CREATE_NO_WINDOW`。高权限 `taskkill` 兼容回退也隐藏窗口，避免黑色命令行长期停留。
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
- 搜索并添加 Microsoft Store / MSIX 应用；候选以 AUMID 去重，旧 WindowsApps 路径条目会原位升级而不是新增重复卡片。
- 拖入 `.exe` 或 `.lnk` 自动添加到当前/默认应用分组。
- 修改启动程序。
- 编辑名称、启动程序和启动参数；历史 `workingDirectory` 字段继续兼容，但当前编辑弹窗不提供独立工作目录控件。
- 移动分组。
- 删除应用。
- 应用卡片拖拽排序。
- 应用拖到侧栏移动分组。
- 高分辨率图标缓存和 fallback 图标；native helper 优先从 EXE 图标资源提取带透明通道的 PNG，缓存版本升级时自动刷新旧图标；对几乎整张不透明纯黑的异常提取结果进行质量拦截，再尝试 EXE 图标或生成图标，避免浅色主题下出现纯黑方块。

本机候选来源：

- Windows Start Apps + AppX 包清单，用于建立 AUMID、PackageFamilyName 与当前 EXE 的映射。
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
- Store 应用图标从 `shell:AppsFolder\<AUMID>` 对应的 Shell Item 提取；编辑弹窗和右键菜单显示/复制稳定 Windows 应用标识，而不是鼓励用户依赖版本化安装路径。

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
- Microsoft Store / MSIX 应用走 `IApplicationActivationManager.ActivateApplication(AUMID)`，不直接执行受版本控制的 WindowsApps EXE；helper 不可用时才用 `explorer.exe shell:AppsFolder\<AUMID>` 回退，且不会把 Explorer PID 误记为应用 PID。
- Store 解析或原生激活失败使用独立错误模型，不给卡片打普通“路径失效”标记，也不自动打开 EXE 选择器。
- 旧配置如果只有 `C:\Program Files\WindowsApps\<package>_<version>_...\*.exe`，启动前会从 PackageFamilyName、processName/name 精确匹配当前 AUMID，更新同一条 `AppEntry` 并保留 `id`、名称、分组、合并卡片引用与排序。
- 同一 PackageFamilyName 可能包含多个 Application Id；迁移必须先精确匹配 AUMID，再结合 processName/name 消歧，禁止随意取包内第一个应用。

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
- `src/main/wake-profiles.ts`
- `src/main/focus-window.ts`
- `native/window-focus-helper/Program.cs`
- `src/renderer/main.tsx`
- `src/renderer/window-focus-feedback.ts`
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
- 支持窗口列表和窗口诊断复制；诊断输出为结构化 JSON，包含匹配指标、Wake Profile / Strategy、全部扫描集合、最终候选、恢复方式与结果、统一失败原因、激活后观察窗口和外部操作次数。

C# helper 当前职责：

- `scan`：从 stdin 读取 staged match JSON，返回 `allWindowsScanned`、`relatedWindows`、`filteredWindows`、`finalCandidates`。
- `focus`：读取 `{ handle, expectedPids }`，返回聚焦结果和前台窗口信息。
- 使用 Win32 API 枚举窗口、读取 PID/title/class/path/rect/style、恢复最小化并尝试前台激活。

候选过滤重点：

- 微信 `WxTrayIconMessageWindow` / `Qt*WxTrayIconMessageWindowClass` 不进入最终候选。
- IME、系统 message window、crashpad、Chrome background surface、Electron notify icon host 等非交互窗口会进入 diagnostics 的 `filteredWindows`，但不能聚焦。
- 隐藏空标题 Chromium surface、隐藏 tool window、0x0 owner/IME 类窗口会被过滤。

Wake Engine 与策略配置：

- `wake-profiles.ts` 集中维护带优先级的内置 Profile；`window-manager.ts` 只消费解析后的 `WakePolicy`，不得重新出现按应用名称散落的 `if / else`。
- 默认未知应用使用 `window-only`，只恢复已经存在的可交互窗口；找不到时返回可诊断失败，不擅自重新启动。
- Codex 使用 `self-launch`，Store / MSIX 使用 `aumid`；两者最多执行一次激活，等待后只重扫并观察窗口状态，不再执行第二次聚焦。
- MuMu / WeGame 交给应用自身处理唤醒，发送一次启动项请求后立即返回 `activation-requested`，不等待、不重扫、不延迟聚焦。
- 微信默认 `window-only`，过滤托盘消息窗口；Notion 采用相同的窗口优先与托盘安全失败策略。两者的 `allowHiddenWindowRestore` 均为 `false`：真正最小化到任务栏的 `visible/iconic` 主窗口仍可恢复，不可见且未最小化的托盘窗口会在调用 helper 前被拒绝。该限制同样跳过旧窗口缓存，并保护右键窗口列表的指定 HWND 路径；失败返回 `tray-restore-unsupported`，不点击托盘也不重新运行应用，界面提示用户手动从托盘打开。
- 用户可以在应用编辑器高级设置中覆盖自动策略。`self-launch` 必须保留第二实例风险提示；AUMID 选项只对确有 Windows 应用身份的条目开放。
- 对外结果统一使用 `focused`、`activation-requested` 或 `failed`，失败原因统一映射为 `no-interactive-window`、`tray-restore-unsupported`、`focus-blocked-by-windows`、`self-launch-failed`、`aumid-activation-failed` 等稳定值。

当前明确约束：

- 单次用户点击最多触发一次会改变外部应用窗口状态的命令；启动项唤醒成功后可以观察状态或反馈结果，但不得再次自动聚焦覆盖用户随后执行的最小化操作。
- 不移动用户鼠标。
- 不点击系统托盘。
- 不把疑似 shell/helper/message 窗口当主窗口。
- 微信与 Notion 仍保持安全失败或 `tray-restore-unsupported` 路径，不做托盘菜单自动恢复。

### 5.6 应用关闭与批量关闭

涉及文件：

- `src/main/process-termination.ts`
- `src/main/batch-app-actions.ts`
- `src/main/main.ts`

当前能力：

- 单应用关闭。
- 多应用卡片成员批量关闭。
- 当前分组及全部已管理运行应用批量关闭。
- 批量 PID 去重。
- 结束多个无关应用时并行执行，减少串行等待。
- 危险进程保护。
- Start Engineer 自身进程保护。
- 普通 `taskkill /T /F` 后会重新确认 PID；只有目标仍在运行时才启动或复用会话 helper，并在首次需要时由关闭动作请求 UAC。
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
- `full` 仍作为底层诊断/兼容能力保留，可通过同一常驻 helper 聚合完整进程资源，但 renderer 正常路径不再请求它。
- 约 800ms TTL。
- single-flight：`full` 不复用 managed-only 采集；managed 可以复用 full。
- 启动台页面只请求 managed 快照；设置页、窗口隐藏和持续空闲分别自动降频。
- `use-runtime-polling.ts` 使用请求代次与最新序号拒绝页面切换前启动的迟到快照；恢复可见时立即刷新，隐藏或空闲时自动降频。

采集来源：

- 常驻 `window-focus-helper.exe runtime` JSON Lines 协议。
- `CreateToolhelp32Snapshot`、`QueryFullProcessImageNameW`、`GetProcessTimes`、`GetProcessMemoryInfo`、`GetProcessIoCounters`。
- helper 缺失、崩溃、超时或协议异常时，才回退到 PowerShell `Get-Process` + CIM `Win32_Process`。

风险：

- helper 故障后的 PowerShell + CIM 回退成本仍高，若频繁出现应优先修 helper，而不是长期运行在回退模式。
- 进程路径可能读不到。
- CPU/磁盘速率需要两次采样，首次为 0 属正常。

建议：

- 记录 managed/full 原生采集耗时和 fallback 次数，建立性能基线。
- 保持应用页仅采已管理应用相关 PID，避免功能回归成全量轮询。
- 若真实低性能设备仍有压力，优先继续调整自动 managed 降频，不恢复用户可见的进程页或新增默认设置项。

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
- 来源包括 Microsoft Store / MSIX、开始菜单、桌面和 Everything 补充。
- `.lnk` 会解析 target executable、工作目录、启动参数、图标路径。
- Store 应用按 AUMID、普通应用按 targetPath 判断已添加状态；同一 Store 应用更新包版本后不会出现第二张卡片。

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
- `src/main/first-run-import.ts`
- `src/main/main.ts`
- `src/main/search-service.ts`
- `src/main/search-ipc.ts`
- `src/preload/preload.cts`
- `src/renderer/main.tsx`
- `src/shared/types.ts`

当前能力：

- 首次启动且应用列表为空、`firstRunImportCompleted` 仍为 `false` 时，渲染层延迟 1200ms 发起一次后台自动导入。
- 首次候选不再直接截取最多 80 个扫描结果，而是优先匹配经过验证的常用应用模板；每个分组最多 6 项、总计最多 20 项，避免首次面对过量且杂乱的信息。
- 模板候选仍按照主界面的真实分组顺序组织；扫描结果或配置路径存在时标记 `isAvailable: true` 并自动导入，未发现项标记为不可用并静默跳过。
- 不再显示候选弹窗、逐项勾选、组内全选或导入成功 Toast，避免让首次使用者重复决策。
- 渲染层只调用 `apps:autoImportFirstRun`；主进程在同一原子任务内完成扫描、可用性过滤、导入和完成状态写入，避免两段 IPC 之间共享候选被并发覆盖。
- 同一进程内的并发自动导入请求复用同一个 Promise。扫描结束后会重新读取应用库和偏好；若延迟期间用户已手动添加应用或其他流程已完成首次导入，立即取消批量导入并保留现有应用。
- Store 首次扫描异常会向上传播，不会被当作“没有候选”而永久写入完成状态；任务锁释放后，下次启动或下一次调用会重新扫描。普通搜索和索引刷新仍保留 Store 失败时使用本地快捷方式结果的容错行为。
- 每个候选完成异步图标缓存后会重新读取应用库去重，最终保存前还会再做一次同步去重，覆盖用户在缓存期间手动添加同一应用的竞态。
- 扫描或模板读取失败不会写入 `firstRunImportCompleted: true`，下次启动仍可重试；没有可用候选属于正常结果，会写入完成状态且不提示用户。
- QA 模板候选会复用正常配置中已经验证的图标数据；普通候选仍走独立提取和黑色无效资源质量回退。
- QA 可在正常用户数据目录创建 `.first-run-import-test.enabled`，让程序切换到隔离的 `start-engineer-first-run-import-test` 用户数据目录。每次真正退出并重启都会从当前主题、分组和应用清单生成只读首次导入模板，随后重置空应用库、强制 `firstRunImportCompleted: false`、使用 `closeBehavior: "quit"` 并自动运行上述后台导入；正常用户数据不会被测试导入写入，删除标记后立即恢复正常目录。
- 2026-07-31 使用新便携版在隔离 QA 模式实测：界面未出现首次选择弹窗或成功 Toast，18 个模板应用中自动导入本机可用的 17 个、静默跳过缺失的 1 个，`firstRunImportCompleted` 正确写为 `true`；正常配置文件未被改写。
- 扫描来源包括 Microsoft Store / MSIX catalog、开始菜单和桌面 `.lnk`。
- 使用 Windows Script Host 解析快捷方式目标。
- 过滤非 `.exe`。
- 排除已存在路径。
- 按名称/路径启发式推荐分组。
- 自动导入后写入 apps，并设置 `firstRunImportCompleted: true`。

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

当前设置页使用两级信息架构：

- 顶层页签只有“偏好”和“分组管理”，默认进入偏好；页签支持左右方向键、Home 和 End。
- 偏好首页常显“启动与操作”，包含开机启动、关闭行为与全局快速唤出。
- “外观”默认只显示当前主题摘要；“更换主题”后才加载主题预设、Wallpaper Glass 控制和完整界面编辑器。
- “高级设置”默认收起，包含运行应用置顶、唯一一处“显示应用名称”、高权限关闭预授权、搜索范围、完整应用内快捷键与 Everything 依赖。
- 搜索依赖默认自动管理；只有进入高级设置或失败排障时才呈现状态、修复和手动选择入口。
- “关于 Start Engineer”位于页脚，诊断功能收在模态弹窗内，不再占用顶层折叠面板。
- 分组管理拥有独立页签；默认全部收起，同一时间最多展开一组，编辑/删除位于“更多操作”菜单，最后一个分组明确禁止删除。
- 设置页面不渲染顶栏全局搜索框，从视觉和键盘路径上减少无关入口。

维护约束：后续新增设置时，先判断能否自动化或放入现有高级区；不得恢复多个同级大折叠面板，也不得把诊断、依赖路径等低频信息重新放回默认首屏。

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
- 未匹配内置 Profile 的应用保持 `window-only`，不把 Self Launch 扩大成通用 relaunch。
- 新增特殊应用时先扩展可测试的 Profile 与失败原因，不能在 `window-manager.ts` 增加按名称分支。

### 6.2 PowerShell 已降级为故障回退

本节原问题已按三阶段完成主要改造：

- 第一阶段：普通应用启动改用 `CreateProcessW`；管理员启动和管理员 `taskkill` 改用 `ShellExecuteExW`；管理员状态改由 .NET Windows Identity 判断。
- 第二阶段：新增由 Electron 托管的常驻 native runtime helper，使用 JSON Lines 复用进程；应用页的 `managed` 快照只采已管理应用、已知 PID 和子进程。
- 第三阶段：当时的 `full` 快照改用 Win32 完整采集；该 UI 现已移除，底层 full 能力仅保留给诊断/兼容路径。ZIP 解压改用 `ZipFile`，开始菜单快捷方式改用原生 COM，高分辨率 Shell 图标改由 helper 提取。

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
- `main.tsx` 已迁出完整设置页、偏好编辑、搜索请求、外部应用拖入、统一网格拖拽、运行快照调度和应用动作控制器，当前约 1215 行；相较最初约 1835 行减少约 34%。

剩余风险：

- `main.ts` 已只保留顶层 Electron 生命周期、服务组装和 IPC 注册器调用，主进程拆分目标基本达成。
- `main.tsx` 当前主要剩余键盘导航、搜索结果动作和旧聚合视图拖拽；后续应优先清理旧聚合视图的独立拖拽路径，不再继续拆分已经稳定的设置页或为行数制造细碎 Hook。
- 服务之间目前使用构造参数和闭包注入，后续新增跨服务能力时应避免重新直接导入全局状态。

### 6.4 默认偏好与产品决策存在差异

owner 曾讨论过更强的启动台定位，但当前代码默认仍是：

- `launchAtStartup: false`
- `closeBehavior: "tray"`
- `runAsAdministrator: false`

这不是 bug，但后续公开发布前要重新确认默认值。

### 6.5 正式发布能力不足

当前已补齐：

- 面向用户的 README、隐私说明、安全策略、贡献指南、故障排查、更新日志和第三方软件说明。
- GitHub Issue / PR 模板与 Windows CI。
- 标签触发的 Windows 安装版/便携版构建、SHA-256 清单和草稿 Release；流水线不会直接公开 Release。
- 设置页版本、数据目录、项目主页和诊断复制入口。
- Everything/ES 下载固定 SHA-256，校验失败不会解压执行。

仍未实现或需要仓库所有者完成：

- 自动更新。
- 商业代码签名证书与 SmartScreen 信誉；工作流已预留 Secrets。
- 崩溃上报。
- 完整新手引导。
- 许可证选择；在明确授权条款前不得把仓库切换为公开。
- GitHub 仓库可见性、Private vulnerability reporting、分支保护与第一个正式 Release；Dependabot 配置已进入仓库，公开并推送后仍需确认首次扫描成功。

发布操作与人工复核见 `docs/RELEASE_CHECKLIST.md`。当前明确采用手动更新策略，README 必须保留未签名与无自动更新提示。

## 7. 高优先级优化建议

### 7.1 窗口唤起继续收敛

统一 Wake Policy / Profile、JSON 诊断和单次外部操作上限已经落地。下一步不应做“自动点击托盘”类方案，而应围绕真实样本继续验证和收敛：

- 在干净 Windows 10 / 11 环境分别回归普通 Win32、微信、MuMu、WeGame、Codex 和 Store / MSIX 应用。
- 新增特殊 Profile 时必须明确匹配优先级、允许的激活方式、是否只做观察扫描、禁止的 className/title 和稳定失败原因。
- 收集诊断 JSON 时重点核对 `selectedWakeProfile`、`selectedCandidate`、`restoreMethod`、`restoreResult` 与 `externalActionsPerformed`，单次请求不得超过一次外部状态改变。
- 继续扩展 helper 的真实窗口测试，尤其是过滤规则、评分、前台切换受 Windows 限制时的结果映射。
- 评估把 Profile 做成受版本控制的数据表，但不要让普通用户承担复杂规则编辑。

涉及：

- `src/main/window-manager.ts`
- `src/main/focus-window.ts`
- `native/window-focus-helper/Program.cs`
- `src/shared/types.ts`

### 7.2 运行状态监控降负载

状态：第一轮已完成。

- renderer 只采 managed app 相关进程，不再请求 full 快照。
- 可见应用页、设置页、窗口隐藏和持续空闲分别使用不同采样频率。
- 页面切换和可见性变化使用 generation/sequence 拒绝迟到响应，pending action 快速探测只在确有动作时运行。
- Runtime diagnostics 已记录 managed/full 请求、真实采集、平均耗时、缓存与 fallback 次数。

下一步只依据低性能机器的真实诊断数据继续调整：

- 评估是否需要用户可见的低功耗模式；当前自动降频优先，不增加默认设置项。
- helper fallback 频率异常时优先修复 helper，不把 PowerShell/CIM 当长期采集方案。

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

渲染层本轮完成：

- `use-runtime-polling.ts` 统一 managed/full 调度、可见性、空闲降频、single in-flight 与迟到响应隔离。
- `use-app-runtime-actions.ts` 原子登记每个应用的 launch/wake/close 动作；重复点击不会创建第二个动作，旧 ticket 不能清除后续状态。
- `use-app-actions.ts` 统一单应用和批量启动、唤起、关闭、运行确认、失败反馈和多应用卡片进度。
- 下一步只处理旧聚合视图拖拽和键盘导航边界，不与已稳定的统一网格状态机强行重写。

### 7.4 设置页信息架构重整

状态：已完成第一轮重整。

- 使用“偏好 / 分组管理”页签代替五个同级折叠面板。
- 日常设置常显，主题详情和高级功能默认折叠。
- 搜索依赖与诊断退居上下文入口，不占用默认首屏。
- 分组次要操作收进更多菜单，并补齐菜单和弹窗的键盘焦点闭环。

下一步仅根据真实用户测试调整文案、默认项和间距；不要在没有使用证据时继续新增分类。

### 7.5 错误模型统一

状态：应用运行主路径第一轮已完成。

- `AppActionFailure` 使用 `domain + code + retryable + diagnostics`，覆盖 launch/wake/close/runtime。
- `app-action-error.ts` 将 Win32 errorCode、WakeFailureReason 和 IPC 异常映射为稳定用户短文案；原始技术信息只留在 diagnostics，不进入 Toast。
- 既有 `cleanErrorMessage` 继续服务非应用动作页面；后续扩展统一错误码时按域渐进迁移，不一次重写全部 IPC。

## 8. 中优先级优化建议

- 内部搜索支持拼音/首字母。
- 搜索框显示当前搜索模式并支持快速切换。
- 扩展可安装应用 catalog，但保持官方来源和安全边界。
- 路径失效做启动前批量检测。
- 应用详情抽屉显示路径、参数、匹配 PID、窗口诊断。
- 配置导入/导出。
- 图标缓存清理。
- About 页面显示版本、数据目录、依赖状态。
- 首次自动导入候选增加更好的去重、推荐排序与可诊断性。
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
- 用真实应用样本继续验证并完善 Wake Profile 匹配与策略配置。
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

- 继续校准首次自动导入的推荐模板、分组和候选清理。
- 增加静默导入失败的诊断入口，但不要重新引入首次选择弹窗。
- 路径失效引导重新选择。
- “打开数据目录 / 复制诊断 / 关于”已完成；后续补充更细的运行诊断导出和新手引导。

### 阶段四：准备公开发布

- README、隐私/安全/排障/贡献/更新日志、发布清单、CI、草稿 Release、校验和与应用内关于诊断已完成。
- 明确默认偏好。
- 增加自动更新。
- 购买证书并配置 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`。
- 选择许可证、公开仓库并启用安全与分支保护设置。
- 按 `docs/RELEASE_CHECKLIST.md` 在干净 Windows 用户环境完成安装/卸载/便携版验收，再审核并发布草稿 Release。

## 11. 接手者注意事项

- 不要把旧文档中的“计划态”直接当作当前事实，先看 `src/shared/types.ts` 和实际 IPC。
- 修改窗口唤起时务必跑 `focus-window.test.ts`、`window-manager.test.ts` 和 helper 相关测试。
- 修改卡片交互时务必跑 `pages.test.ts`、`app-card-interaction.test.ts`、`card-click.test.ts`、`keyboard-navigation.test.ts`。
- 修改运行识别时务必跑 `runtime-monitor.test.ts`、`batch-app-actions.test.ts`。
- 修改搜索时要关注 `search-panel`、Everything fallback、候选添加、方向键选中不被 runtime 刷新重置。
- 修改 Store 应用支持时要同时检查：
  - `windows-store-apps.test.ts` 的 AUMID / PackageFamilyName 解析和多 Application Id 消歧。
  - `app-discovery.test.ts`、`search-service.test.ts` 的旧版本路径原位迁移与候选去重。
  - `launch-service.test.ts` 的原生 AUMID 请求、卸载提示和“不要弹 EXE 重选”行为。
  - `icon-cache.test.ts`、`section-apps.test.ts`、`app-edit-dialog.test.ts` 的图标、聚合去重和稳定标识展示。
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

### 11.1 2026-08-20 P0 启动、状态与后台性能治理

- 应用卡片不再分别用“运行指标 + 启动中 ID 集合”猜测状态。`src/renderer/app-runtime-state.ts` 把 Runtime 识别结果与短暂的 launch / wake / close 动作统一为 `stopped / launching / running / waking / closing / unknown`；失败是动作结果，不会把仍在运行的应用错误改成 stopped。多应用卡片从成员状态派生进度，运行检测继续是事实来源。
- 普通分组只请求 managed 快照。可见普通分组基础间隔为 5 秒，设置页 10 秒，窗口隐藏时 12 秒，持续空闲后进一步降频；恢复可见时立即刷新一次。原先固定 500ms 的 `tasklist.exe` 循环已删除，快速探测只在启动 / 关闭动作等待确认期间以 1 秒间隔运行。
- `RuntimeMonitor` 继续保证同一时刻最多一份兼容采样（managed 请求可复用 full），并记录 managed/full 请求数、真实采集数、平均耗时、缓存命中和 single-flight 复用；`RuntimeService` 额外记录 native helper / PowerShell fallback 次数。这些信息只进入本地“关于”诊断，不上传网络。
- `startup-view-cache.json` 仅缓存分组、卡片 ID/名称/顺序、图标缓存信息、多应用卡片、主题、布局和窗口尺寸，用于真实配置读取完成前稳定首屏；不保存可执行路径、PID、进程状态、唤醒诊断或其它高风险字段。缓存损坏会备份并忽略，真实配置始终在后台加载后覆盖缓存，缓存不能成为第二配置源。
- 启动诊断记录 `process-start`、`electron-ready`、`main-window-created`、`renderer-mounted`、`first-ui-visible`、`config-hydrated`、`first-managed-snapshot` 与 `background-init-completed`。当前运行与上一次运行的本地阶段耗时可复制，用于同机对比；不得把这些标记改成遥测。
- Wake Engine 的候选选择在既有进程关系、路径、名称、标题、类名、可见性、最小化、尺寸、owner / tool-window 过滤基础上，明确提高最近成功窗口、当前前台窗口和真实交互窗口的优先级，并保持稳定句柄排序。微信 / Notion 等特殊限制仍只能在 `wake-profiles.ts` 中配置，不能用通用评分绕过隐藏托盘窗口禁令；每次请求的外部状态改变上限仍为一次。
- 本轮新增 `app-runtime-state.test.ts`、`runtime-polling.test.ts`、`startup-state-service.test.ts`，并扩充多窗口候选测试；最终验证为 typecheck 通过、94 个测试文件 / 441 项测试通过、生产构建通过、Electron Smoke 通过、helper Smoke 覆盖 194 个快捷方式通过。Windows x64 重打包通过：helper 14.05 MiB、安装版 82.96 MiB、便携版 82.72 MiB，语言包严格为 `en-US.pak + zh-CN.pak`；最终 SHA-256 分别为安装版 `70688de6e5842208c3f0bfc88f6a48beaddad708cbb482be86761d7b43e393a0`、便携版 `ce45a41bfc2d765c55de89e6a7b29cb1a3dea7cd74cd39075e36ffc00181ff4e`。

### 11.2 2026-08-23 P1 运行时动作可靠性与渲染层瘦身

- `use-runtime-polling.ts` 接管按 section、窗口可见性和空闲时间分级的调度。每次请求携带 generation/sequence，页面切换前启动或已被新请求取代的快照不得覆盖当前界面；pending action 的 1 秒快速探测仍只做轻量运行确认。

- `use-app-runtime-actions.ts` 用原子 registry 管理 launch/wake/close ticket。同一应用已有动作时拒绝重复请求，批量动作只有全部成员空闲时才整体登记；旧 ticket 不能清除后续动作。
- `use-app-actions.ts` 统一单应用和多应用卡片的启动、唤起、关闭、批量关闭、运行确认、超时及反馈。`main.tsx` 不再直接维护动作 Map、轮询 timer 或 folder launch timer，并从约 1478 行降至约 1215 行。
- `AppActionFailure` 与 `app-action-error.ts` 将 Win32 errorCode、WakeFailureReason 和 IPC 异常归一化为稳定 `domain/code/retryable`；用户 Toast 只使用短文案，原始技术信息仅位于 diagnostics。页面属性 `launchingAppIds` 已更名为实际语义 `runtimeStates`。
- Wake Engine 新增微信混合托盘/任务栏、Notion 纯托盘、Chromium owner/tool window 固定样本，以及两个并发请求的 stale 隔离测试；前一个请求不得在用户已选择下一应用后执行 focus。
- 最终验证：typecheck 通过，97 个测试文件 / 453 项测试通过，生产构建、helper Smoke（194 个快捷方式）和 Electron Smoke 通过。Windows x64 安装版与便携版已重新打包，helper 14.05 MiB、安装版 82.96 MiB、便携版 82.72 MiB，语言包严格为 `en-US.pak + zh-CN.pak`；最终 SHA-256 分别为安装版 `70bb805dc0c04908a6a201910671f583b0285976ce6089befbf765a877d686f8`、便携版 `12eac41f7a5695b69dba3e0339d625a58820945ea659f932fb0e538a6f0ee628`。

### 11.3 2026-08-24 移除低频进程界面

- 删除侧栏“进程”入口、`ProcessPage`、进程筛选/排序/虚拟列表、进程右键菜单、进程结果搜索和对应 CSS 主体；产品一级导航回归“已添加应用 + 用户分组 + 设置”。
- `GroupService.listGroups()` 不再发布 `processes` 系统分组，`SystemSectionId` 只保留 `all-apps | settings`。旧 `startup-view-cache.json` 中的 `processes` 会由 `resolveLoadedSection()` 安全迁移到首个用户分组，不产生空白页。
- preload 与主进程不再暴露 `processes:snapshot` / `processes:killGroup`。renderer 的运行调度固定请求 managed 快照，关闭应用、批量关闭、运行绿点、窗口唤醒和诊断仍使用现有 Runtime / Wake Engine，不因移除页面而降级。
- 内部搜索现在只返回 Start Engineer 已添加应用；设置页说明与“关于”定位同步改为桌面启动台。底层 `ProcessInfo`、full 采集和进程终止服务继续服务诊断、启动关联、窗口匹配与应用级关闭，不得误删。
- 最终验证：`npm run typecheck` 通过；完整 Vitest 共 `97` 个测试文件、`449` 项测试全部通过；生产构建、原生窗口唤醒 helper 冒烟和 Electron 生产包启动冒烟均通过。
- Windows 产物已重新打包并通过体积检查：安装版 `82.96 MiB`，便携版 `82.72 MiB`，仅保留 `en-US.pak` 与 `zh-CN.pak` 两个 locale。
- 发布校验：安装版 SHA-256 为 `996103a93ea48ac6629063ef7a1a02cfc08f696b02f321ba2564c5cd8d2d6aa8`；便携版 SHA-256 为 `6ca583e349fa334030eb4aa7f8f4ae47ec12a1aa877d9ff531aa74b315378714`。

### 11.4 2026-08-24 拖拽取消与悬浮预览清理

- 修复“已添加应用”中拖拽卡片后，因窗口外释放事件丢失而导致预览持续跟随鼠标、无法退出的问题。
- 已添加应用、普通分组/多应用卡片与设置页分组管理统一补齐拖拽生命周期：起始元素捕获指针；`Escape`、`pointercancel`、窗口失焦、页面隐藏以及检测到主按钮已释放时均立即取消拖拽。
- 取消操作只清理候选对象、预览、合并高亮、动画计时器和全局拖拽标记，不执行排序、移动分组或合并卡片；正常 `pointerup` 仍按原逻辑完成放置。
- 旧版“已添加应用”拖拽状态改为 ref 与 React state 同步提交，避免全局监听器读取旧闭包；实际拖拽结束后的合成 click 也会被全局拖拽标记拦截，防止误启动应用。
- 新增 `pointer-drag-lifecycle.ts` 与回归测试，覆盖主按钮释放判定、三套拖拽控制器的取消监听和应用卡片指针捕获。
- 最终验证：`npm run typecheck` 通过；完整 Vitest 共 `98` 个测试文件、`454` 项测试全部通过；生产构建、原生窗口 helper 冒烟和 Electron 生产包启动冒烟均通过。
- Windows 产物已重新打包并通过体积检查：安装版 `82.96 MiB`，便携版 `82.72 MiB`，仅保留 `en-US.pak` 与 `zh-CN.pak`；安装版 SHA-256 为 `ec48f5b447f0275f02249155e038f7b88d628f010a84261fcc2d883bbf131dc9`，便携版为 `ccf755154235a6c3b7e2b20f4772da41daf8dc2cbf2725b974ee50593555e83d`。

### 11.5 2026-08-31 v0.1.0 草稿发布准备

- 发布基线为已合并的 `main`，应用版本保持 `0.1.0`。先执行 `npm run release:prepare`，核验安装版、便携版和 SHA-256 后再创建 annotated `v0.1.0` 标签；不允许用未验证的新提交替换已经推送的标签。
- 修复 Draft Release job 未 checkout 仓库时缺少 GitHub CLI 仓库上下文的问题：显式设置 `GH_REPO: ${{ github.repository }}`，并增加发布契约回归断言。
- 标签构建只创建 Draft；本地生成的 EXE 与 GitHub Actions 生成的 EXE 分开核验，不能用本地校验和代替 GitHub 产物校验和。GitHub 下载包经用户实际验收后，才补齐发布说明、标记 Pre-release 并公开；README 与小黑盒宣传不得提前声称已发布。
- 本轮验证、标签、Actions 和下载验收状态将在执行后补充；许可证选择、代码签名和用户手工验收不由自动构建代替。

### 11.6 2026-09-05 外部退出后的运行状态纠正

- 暂停 `v0.1.0` Release：真实使用中发现鸣潮退出后，卡片仍会短暂保留上一轮进程快照的绿色运行指示。
- 现场核对确认 `Wuthering Waves.exe` 已不存在，应用配置也没有残留 `launchedPid` / `associatedPids`；问题来自前台运行状态采样延迟，而不是误匹配后台进程。
- Start Engineer 窗口从外部应用切回并重新获得焦点时，现在会立即请求一次 managed runtime snapshot；普通应用页前台轮询由 `5s/10s`（活跃/空闲）收紧为 `3s/6s`，设置页和后台隐藏状态继续保持低频，兼顾指示及时性与后台成本。
- 新增回归约束，确保窗口 focus 监听及卸载清理不会在后续重构中丢失。`npm run typecheck` 通过；完整 Vitest 共 `98` 个测试文件、`455` 项测试全部通过；生产构建、原生窗口 helper 冒烟和 Electron 生产包启动冒烟均通过。
- Windows 产物已重新打包并通过体积检查：安装版 `82.96 MiB`，便携版 `82.72 MiB`；安装版 SHA-256 为 `721a0a2af750c2d04bdac29ca9fbd09445d1bacac4fa454432a1aec050a0dee1`，便携版为 `47f13ee8cd537e02b089c99ecf63fec5f57f4be5960a4ba23f7fa1d0677f7dc9`。本轮未创建或推送 `v0.1.0` 标签，Release 继续暂停。

### 11.7 2026-09-05 发布前关闭脚本进程树隔离

- `release:prepare` 的预关闭脚本曾对 Start Engineer PID 执行 `taskkill /T`；当用户通过 Start Engineer 启动 Codex 等应用时，这些应用属于其 Windows 子进程树，因而会被打包清理错误关闭。
- 预关闭逻辑改为只结束枚举到的 `Start Engineer.exe` PID；普通与提权回退路径均禁止使用 `/T`，不会再递归终止由启动器打开的其他应用。
- 增加发布前置契约测试，明确拒绝在该脚本中恢复 `/T`。`npm run typecheck` 通过，完整 Vitest 共 `98` 个测试文件、`455` 项测试全部通过。后续发布仍需先确认 Start Engineer 已关闭，再执行完整发布准备与产物验证。

### 11.8 2026-09-05 v0.1.0 公开预览发布

- `v0.1.0` annotated tag 指向发布基线 `32d29432fa4649c8eb2b9f40c49dcf5b37468588`；本地 `release:prepare` 完整通过，GitHub Actions `Build draft release` 的 Windows 构建与 Draft Release job 全部成功。
- GitHub 生成的安装版、便携版和 `SHA256SUMS.txt` 已下载到独立目录复核；远程安装版 SHA-256 为 `af56a4c0fd026f4e07b3cb6cc12d9deb975824e26984d5e819a68d4512115645`，便携版为 `4a5023a45c05180f0862577a781ff957ebbd571b1344836d8573a5c3bd9d48c2`，均与远程校验文件一致。
- GitHub 生成的便携版已执行一次实际 smoke 启动，完成解包、主进程启动和正常退出，未残留 Start Engineer 进程。
- Release Notes 已补充主要功能、下载说明与已知限制；`v0.1.0` 已作为 Pre-release 发布。README 原本已经指向 GitHub Releases，无需再次修改。
- 当前 EXE 未使用商业代码签名证书，Release Notes 与 README 均明确提示 SmartScreen 风险；仓库当前未声明 `LICENSE`，本轮没有擅自替用户选择许可证。

### 11.9 2026-09-05 开机启动快速运行时

- 真实启动记录显示应用进程启动后约 `1.5s` 即可见，但当前开机项指向单文件便携版；同一构建 smoke 实测便携版约 `7.2s`、已解包版约 `2.5s`，约 `4.7s` 消耗在每次自解压，且该时间不包含 Windows 对普通登录启动项的调度等待。
- 安装版继续直接注册安装目录中的可执行文件；便携版开启开机启动时，将当前已解包运行时原子复制到 `%LOCALAPPDATA%\Start Engineer\startup-runtime`，开机项改为直接启动稳定缓存，不再在每次登录时解压约 83 MiB 的便携包。
- 缓存标记同时记录应用版本、便携包大小和修改时间；用户替换便携包并手动运行新版本后，已开启的开机项会自动刷新缓存。应用配置仍保存在原有 Roaming 用户数据目录，不会被拆成两套。
- 设置页明确说明便携版首次启用会准备本机启动缓存；新增安装版直启、便携版首次复制、同版本新构建刷新，以及开机项自动校正测试。`npm run typecheck`、99 个测试文件 / 458 项测试及生产 smoke 均通过；同一新构建的隐藏启动实测由便携包 `6105ms` 降至缓存运行时 `908ms`，节省 `5197ms`。本节产物随后随侧栏交互优化再次构建，当前校验值以 11.10 为准。

### 11.10 2026-09-05 侧栏空白区域新建分组

- 将“新建分组”从已有分组的右键菜单移到侧栏空白区域的右键菜单，使操作对象与菜单职责一致：分组菜单仅处理重命名、排序和删除，空白区域负责创建新对象。
- 已添加应用、已有分组、设置入口和品牌图标均显式排除空白区域菜单，避免用户在现有控件上右键时误触发新建；设置页原有“新建分组”按钮继续保留，兼顾可发现性与键盘操作。
- 右键菜单补充标准 `menu` / `menuitem` 语义，并新增菜单职责、空白区域命中和控件排除测试。`npm run typecheck`、100 个测试文件 / 461 项测试及生产 smoke 均通过；重新生成安装版 `82.96 MiB`、便携版 `82.72 MiB`，SHA-256 分别为 `08656da8e3f5ddc4a9b8c2239f7281aeaf0eb16a189b40aedc2d539b0d0d5167`、`8f28e35890a0f1e772e08eb27692c057fa8af5b31355043660c7d6bd3fa63e8e`。

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
- `D:\Code\Start Engineer\src\main\startup-state-service.ts`
  - 安全首屏缓存、损坏恢复、当前/上次启动阶段耗时记录。
- `D:\Code\Start Engineer\src\main\app-service.ts`
  - 应用配置读写、编辑、分组迁移、排序和删除。
- `D:\Code\Start Engineer\src\main\group-service.ts`
  - 用户分组、多应用卡片、整卡合并、成员迁移和混合网格顺序。
- `D:\Code\Start Engineer\src\main\launch-service.ts`
  - 普通 EXE 与 Store AUMID 原生启动、PowerShell / Explorer 回退、旧路径迁移、运行判断、显式 Self Launch / AUMID 唤醒执行、MuMu 单实例唤醒参数和启动后进程关联。
- `D:\Code\Start Engineer\src\main\windows-store-apps.ts`
  - Microsoft Store / MSIX catalog、AUMID 与 PackageFamilyName 解析、当前安装路径映射和旧 WindowsApps 路径消歧。
- `D:\Code\Start Engineer\src\main\runtime-service.ts`
  - managed/full 采集、RuntimeMonitor 装配、快速状态与批量终止。
- `D:\Code\Start Engineer\src\main\search-service.ts`
  - Store catalog、本机快捷方式、Everything 候选、首次导入、候选去重和旧 Store 条目原位修复。
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
  - 进程采集结果聚合、应用匹配、运行指标与底层诊断数据。
- `D:\Code\Start Engineer\src\main\window-manager.ts`
  - 策略驱动的 Wake Engine：窗口优先、单次外部操作上限、缓存与 stale request、激活后只观察、统一结果/失败原因、窗口列表和 JSON 诊断。
- `D:\Code\Start Engineer\src\main\wake-profiles.ts`
  - 内置 Wake Profile 匹配优先级、默认安全策略、用户唤醒方式覆盖，以及 MuMu / WeGame / 微信 / Notion / Codex / Store 的集中式策略定义。
- `D:\Code\Start Engineer\src\main\focus-window.ts`
  - helper runner、PowerShell fallback、窗口阶段构造和聚焦 API；聚焦成功必须确认目标窗口已退出最小化状态。
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
- `D:\Code\Start Engineer\src\renderer\app-runtime-state.ts`、`runtime-polling.ts`
  - 统一应用生命周期状态，以及按页面、可见性和空闲时间分级的采样策略。
- `D:\Code\Start Engineer\src\renderer\use-runtime-polling.ts`
  - 运行快照调度、请求代次、可见性恢复、空闲降频和 pending action 快速探测。
- `D:\Code\Start Engineer\src\renderer\use-app-runtime-actions.ts`、`use-app-actions.ts`
  - 应用动作原子登记、防重复/防迟到，以及启动、唤起、关闭和多应用卡片批量反馈。
- `D:\Code\Start Engineer\src\renderer\app-action-error.ts`
  - 应用动作稳定错误码、可重试属性、短用户文案与技术诊断分离。
- `D:\Code\Start Engineer\src\renderer\app-edit-dialog.tsx`
  - 应用名称、启动程序、参数与渐进披露的唤醒方式设置；Self Launch 风险提示和 AUMID 可用性限制。
- `D:\Code\Start Engineer\src\renderer\window-focus-feedback.ts`
  - Wake Engine 统一失败原因到简洁用户提示的映射；已接受的一次激活请求不误报失败。
- `D:\Code\Start Engineer\src\renderer\context-menus.tsx`
  - 应用和分组右键菜单，以及基于实际尺寸的视口边界定位。
- `D:\Code\Start Engineer\src\renderer\section-apps.ts`
  - 普通分组和 `all-apps` 聚合视图的应用列表、去重和排序辅助。
- `D:\Code\Start Engineer\src\renderer\keyboard-navigation.ts`
  - 应用网格键盘导航、按键规范化和可配置命令匹配辅助。
- `D:\Code\Start Engineer\src\renderer\pages.tsx`
  - 普通分组页与统一混合网格页面组件。
- `D:\Code\Start Engineer\src\renderer\styles.css`
  - 全局布局、应用/多应用卡片、启动关闭反馈、设置页、多主题、Wallpaper Glass、Clear Desktop 和 UI 编辑样式。
- `D:\Code\Start Engineer\src\renderer\startup-schedule.ts`
  - 启动后非关键任务与后台初始化完成标记；不得恢复无条件完整进程预热。
- `D:\Code\Start Engineer\scripts\smoke.mjs`
  - 生产构建烟测。

## 13. 当前结论

Start Engineer 已经不只是一个简单启动器。当前代码已经具备应用分组、多应用卡片与混合网格、聚合应用视图、首次导入、搜索添加、拖放添加、Microsoft Store / MSIX 稳定 AUMID 启动与升级迁移、可安装应用安全入口、运行监控、实时批量操作反馈、Everything 兜底搜索、托盘、可配置应用内快捷键、全局快捷键、会话级高权限进程控制、Splash、实时 UI 编辑、UI 分享码、统一 Wallpaper Glass 外观的多套配色、独立 Clear Desktop、native 窗口 helper，以及策略驱动且可诊断的统一 Wake Engine 等较完整的桌面应用能力。

下一阶段最重要的不是继续堆新入口，而是在真实 Windows 10 / 11 与不同应用生命周期下验证 Wake Profile、运行识别和关闭反馈，并降低后台监控成本。新增兼容策略应优先扩充 Profile、统一失败原因和测试样本，不能退回散落的应用名判断。随后再继续拆分大型控制器和完成公开发布人工核验，项目会更接近稳定公开版本。
