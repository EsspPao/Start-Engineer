# Start Engineer 项目迁移与开发上下文

> 建议保存为：`D:\Code\Start Engineer\PROJECT_CONTEXT.md`
> 文档整理日期：2026年6月11日

## 1. 项目名称

- 当前项目名称：**Start Engineer**
- 界面品牌名称：**Star Engineer**
- 原开发代号：**CommandDeck Next**
- 当前项目路径：`D:\Code\Start Engineer`
- 原项目备份：`D:\IDE\Codex\2026-05-29\CommandDeckNext`
- Electron 用户数据目录：`%APPDATA%\commanddeck-next`

当前只迁移了项目位置，没有修改内部包名、用户数据目录或界面品牌。

## 2. 项目目标

开发一款轻量、快速的 Windows 应用启动管理器。

用户可以在一个统一界面中管理游戏启动器、微信、Steam、办公软件和常用工具，不再逐个打开程序，也不依赖杂乱的 Windows 开机启动项。

应用同时提供类似 Windows 任务管理器的资源监控能力，包括：

- 进程运行状态
- CPU 使用率
- 内存占用
- 磁盘读写速度
- PID
- 应用进程聚合
- 启动、结束和文件位置管理

## 3. 用户需求

### 核心需求

- 在一个界面中管理所有常用程序。
- 支持游戏、办公、工具等应用分组。
- 支持添加任意 Windows `.exe`。
- 支持启动和结束已配置应用。
- 支持查看全部 Windows 进程。
- 同名进程聚合显示，例如微信只显示一行。
- 支持搜索、筛选和排序进程。
- 支持提取并显示真实程序图标。
- 支持自定义分组。
- 支持应用卡片拖拽到其他分组。
- 窗口支持拖动、最小化、最大化和关闭。
- 所有操作应轻便、快速、流畅。

### 管理需求

- 应用卡片右键提供完整管理功能。
- 进程行右键提供结束、定位和复制信息等功能。
- 分组支持新增、改名、更换图标、删除和排序。
- 设置页可以展开分组并查看其中应用。
- 删除分组前必须迁移其中应用。
- 删除应用只删除 Start Engineer 配置，不删除真实文件。

## 4. 当前已经确定的功能

### 系统入口

固定系统入口：

- 进程
- 设置

系统入口不能删除、重命名或接收应用拖拽。

### 动态应用分组

初始应用分组：

- 二游
- 办公
- 工具

以上分组已经迁移为普通动态分组，可以：

- 新建
- 重命名
- 更换内置图标
- 调整顺序
- 删除
- 接收应用拖拽

### 进程管理

进程页面支持：

- 全部进程
- 只看已管理应用
- 按名称搜索
- 按名称、CPU、内存和磁盘排序
- 按进程名称聚合多个 PID
- 显示进程数量
- 右键锁定当前进程行，防止排序刷新导致目标跳动

进程右键菜单包括：

- 结束进程组
- 打开文件所在位置
- 复制进程名称
- 复制文件路径
- 复制 PID

Windows 关键进程和 Start Engineer 自身进程禁止结束。

### 应用管理

应用右键菜单包括：

- 启动
- 结束进程
- 打开文件所在位置
- 修改启动程序
- 编辑应用信息
- 移动到分组
- 复制程序路径
- 移除应用

编辑内容包括：

- 应用名称
- 启动参数
- 工作目录

### 拖拽

- 应用卡片可以拖到左侧任意动态应用分组。
- 设置页展开区内的应用也可以拖到其他分组。
- 分组可以在设置页拖拽排序。
- 拖拽分组只改变导航顺序。
- 拖拽应用只改变所属分组，不改变卡片排序。
- `Esc`或无效投放可以取消拖拽。

## 5. UI 设计风格

整体采用浅色 Windows 桌面应用风格：

- 无边框 Electron 窗口
- 左侧固定导航
- 顶部搜索栏
- 右侧主内容区
- 自定义窗口控制按钮
- 白色或浅灰背景
- 蓝色作为主要强调色
- 低对比边框
- 克制的阴影和圆角
- 界面优先清晰、紧凑和易扫描

设计参考：

- Windows 11
- Windows 任务管理器
- 用户提供的 Star Engineer 页面设计稿

需要避免：

- 复杂多边形背景
- 重叠卡片
- 大面积装饰
- 过多重复信息
- 影响性能的过量模糊和阴影

## 6. 页面结构

### 全局窗口

- 左侧导航
- 自定义标题栏
- 最小化按钮
- 最大化/还原按钮
- 关闭按钮
- 全局搜索栏
- 主内容区
- Toast 错误提示
- 自定义右键菜单
- 确认弹窗和编辑弹窗

### 进程页

- 搜索框
- “全部进程 / 已管理应用”切换
- 进程表格
- 进程名称
- CPU
- 内存
- 磁盘
- PID 与进程数量
- 排序功能
- 右键菜单

### 应用分组页

- 当前分组应用卡片网格
- 应用真实图标
- 应用名称
- 运行状态点
- 应用选择状态
- 添加应用按钮
- 启动按钮
- 修改启动程序入口
- 应用右键菜单

### 设置页

- 分组管理列表
- 新建分组
- 编辑分组
- 删除分组
- 拖拽调整顺序
- 手风琴展开分组
- 展示分组内全部应用
- 空分组添加应用入口
- 设置页内应用右键管理
- 设置页内跨分组拖拽

## 7. 技术栈

### 桌面端

- Electron 33
- Electron Main Process
- Electron Preload
- 安全 IPC 通信
- 无边框 `BrowserWindow`

### 前端

- React 18
- TypeScript
- Vite 5
- 原生 CSS
- React Hooks
- Pointer Events
- Web Animations API / FLIP 动画

### Windows 集成

- PowerShell
- `Get-Process`
- `Get-CimInstance Win32_Process`
- `Start-Process`
- Electron `shell`
- Electron `clipboard`
- Electron `app.getFileIcon`
- Windows 原生错误码分类

### 项目工具

- npm
- TypeScript Compiler
- `package-lock.json`
- 当前没有引入额外状态管理或 UI 框架

## 8. 当前代码结构

```
D:\Code\Start Engineer
├─ src
│  ├─ main
│  │  └─ main.ts
│  ├─ preload
│  │  └─ preload.cts
│  ├─ renderer
│  │  ├─ global.d.ts
│  │  ├─ main.tsx
│  │  └─ styles.css
│  └─ shared
│     └─ types.ts
├─ scripts
│  └─ dev.mjs
├─ dist
├─ dist-electron
├─ node_modules
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ tsconfig.electron.json
├─ vite.config.ts
└─ README.md
```

### 模块职责

```
src/main/main.ts
```

- 创建 Electron 窗口
- 注册 IPC
- 保存和读取应用配置
- 保存和读取分组配置
- 启动与结束程序
- 获取 Windows 进程信息
- 提取程序图标
- 处理剪贴板和文件定位
- 处理窗口最小化、最大化和关闭

```
src/preload/preload.cts
```

- 通过 `contextBridge`向 React 暴露安全 API
- 转发应用、分组、进程和窗口 IPC

```
src/renderer/main.tsx
```

- 当前主要 React 界面
- 页面导航
- 进程表格
- 应用卡片
- 设置页
- 右键菜单
- 拖拽交互
- 弹窗
- 资源轮询

```
src/renderer/styles.css
```

- 全部界面样式
- 拖拽动画
- 分组展开动画
- 自定义标题栏和窗口控件

```
src/shared/types.ts
```

- 应用、分组、进程和指标类型
- IPC API 类型
- 启动结果类型

## 9. 已经实现的功能

- Electron + React + TypeScript 基础架构
- 生产构建相对资源路径，`npm start`不再因 `/assets`路径白屏
- 无边框窗口
- 自定义最小化、最大化/还原和关闭
- 左侧动态导航
- 进程、应用分组和设置页面切换
- 应用选择和搜索
- 进程搜索、筛选和排序
- 同名进程聚合显示
- CPU、内存和磁盘采样
- 进程右键锁定
- 进程右键菜单
- 应用右键完整管理菜单
- 添加 `.exe`
- 修改应用启动程序
- 启动应用
- 结束应用相关进程
- 打开程序文件位置
- 复制路径、名称和 PID
- 删除应用配置
- 自动提取 `.exe`图标
- 图标缓存与 fallback 图标
- 动态分组创建、编辑、删除和排序
- 删除分组时迁移应用
- 设置页分组手风琴展开
- 展示分组内应用图标和运行状态
- 应用拖到其他分组
- 分组拖拽排序和 FLIP 让位动画
- PowerShell `Start-Process`启动程序
- UAC 点击“否”时按用户取消处理，不显示技术错误
- 启动失败返回结构化结果
- 用户配置保存在 Electron `userData`
- 项目已迁移到 `D:\Code\Start Engineer`
- 新目录已完成 `npm ci`
- `npm run typecheck`通过
- `npm run build`通过
- Electron 生产版启动烟测通过

## 10. 尚未实现的功能

### 性能优化计划尚未落地

之前制定过完整性能优化计划，但迁移前的执行被中断，不能视为已经实现：

- 主进程资源快照单例采集器
- IPC 请求 single-flight 合并
- 快照 TTL 缓存
- 防止轮询请求重叠
- 进程页与其他页面使用不同刷新频率
- 最小化或隐藏时暂停全量采集
- 首屏渲染后再加载进程数据
- 进程索引替代重复数组遍历
- React 组件拆分和 `React.memo`
- 进程虚拟列表
- 拖拽 `requestAnimationFrame`节流
- 拖拽预览使用直接 DOM transform
- 性能测量与开发日志

### 产品功能尚未实现

- Windows 安装包
- 自动更新
- 系统托盘
- 开机自启动
- 开机后自动启动指定应用组
- 批量启动整个分组
- 应用卡片手动排序
- 自定义图片作为分组图标
- 自动扫描已安装游戏
- Steam 游戏库识别
- 启动延迟和启动顺序配置
- 云同步
- 多设备同步
- 账号系统
- 主题切换
- 深色模式
- 多语言
- 应用资源历史曲线
- 资源告警
- 全局快捷键

## 11. 已知问题

### 性能问题

当前最大的性能瓶颈是资源监控：

- 每次快照都会启动新的 `powershell.exe`
- 每轮同时执行 `Get-Process`和 CIM 查询
- 当前约每 1.5 秒刷新一次
- 上一轮未完成时缺少完整防重入机制
- 应用匹配会重复遍历进程数组
- 资源更新可能导致大范围 React 重渲染
- 进程数量较多时表格没有虚拟化

这些问题会导致：

- 启动后数据出现较慢
- 操作偶尔不够跟手
- 进程页面刷新时可能卡顿
- 管理器自身 CPU 占用偏高

### 拖拽问题

设置页分组排序仍有一个明确遗留问题：

- 拖拽预览与鼠标位置距离较远
- 需要保存鼠标按下位置相对于卡片左上角的偏移
- 预览位置应使用 `鼠标坐标 - 抓取点偏移`
- Pointer Move 应通过 `requestAnimationFrame`节流

### 架构问题

- `src/renderer/main.tsx`文件过大
- 大部分页面、弹窗、菜单和拖拽逻辑集中在一个文件
- 全局状态更新容易引发无关组件重渲染
- CSS 仍包含 `backdrop-filter`和较重阴影
- 开发模式仍同时启动 Vite、TypeScript Watch 和 Electron

### 工程问题

- 当前目录不是 Git 仓库
- 尚未建立提交历史和版本基线
- 没有自动化单元测试
- 没有端到端测试
- 没有 Electron 打包配置
- `package.json`名称仍为 `commanddeck-next`
- 项目目录叫 Start Engineer，但界面显示 Star Engineer，名称尚未统一

## 12. 下一步开发计划

### 第一阶段：修复流畅度

1. 增加资源采集 single-flight，任何时刻只允许一个 PowerShell 采集任务。
2. 为快照增加短时间缓存，多个 IPC 调用共享结果。
3. 进程页约 1 秒刷新，其他页面约 5 秒只刷新已管理应用。
4. 窗口最小化或隐藏时暂停全量监控。
5. 先显示本地应用和分组，再异步加载资源数据。
6. 为应用和进程建立名称、路径和 PID 索引。
7. 将 React 主界面拆分成独立组件并隔离资源更新。
8. 对长进程列表实现虚拟滚动。
9. 修复拖拽预览偏移。
10. 使用 `requestAnimationFrame`节流拖拽更新。
11. 减少模糊、阴影等高成本视觉效果。

验收目标：

- 生产版首屏小于约 800ms
- 常规点击响应小于约 100ms
- 拖拽接近 60 FPS
- 空闲 CPU 通常低于 1%
- 不产生重叠的 PowerShell 采集任务

### 第二阶段：工程整理

1. 初始化 Git 仓库。
2. 提交当前迁移后的可运行版本作为基线。
3. 拆分 `main.tsx`。
4. 增加资源监控单元测试。
5. 增加应用和分组 IPC 测试。
6. 增加 Electron 烟测脚本。
7. 统一 Start Engineer / Star Engineer 命名。
8. 完善 README 和开发命令。

### 第三阶段：桌面产品能力

1. 系统托盘。
2. 开机自启动。
3. 分组批量启动。
4. 应用启动顺序和延迟。
5. Electron Builder 安装包。
6. 自动更新。
7. 深色模式。
8. 应用资源历史图表。

## 13. 新聊天继续开发时的上下文

新聊天开始时，应首先说明：

```
项目路径：D:\Code\Start Engineer
技术栈：Electron + React + TypeScript + Vite
系统：Windows
包管理器：npm
旧项目备份：D:\IDE\Codex\2026-05-29\CommandDeckNext
当前 Electron 用户数据目录保持为 %APPDATA%\commanddeck-next
```

开发前需要执行：

```
cd "D:\Code\Start Engineer"
npm run typecheck
npm run build
```

开发模式：

```
npm run dev
```

运行最近一次生产构建：

```
npm start
```

重新构建并运行：

```
npm run start:build
```

### 开发注意事项

- 不要修改或删除原项目备份，除非用户明确要求。
- 不要改变 Electron 用户数据目录，否则已有应用和分组可能看起来“丢失”。
- 所有 Node 和 Windows 系统能力必须放在 Electron Main Process。
- React 只能通过 Preload 暴露的安全 IPC 调用系统能力。
- 不要开启 `nodeIntegration`。
- 保持 `contextIsolation`。
- Windows 危险进程保护必须在主进程再次校验。
- 应用删除只删除配置，不能删除真实 `.exe`。
- 分组删除必须迁移应用。
- UAC 用户取消属于正常结果，不能显示错误。
- 配置文件损坏时应备份并恢复默认配置。
- 动态分组不能重新写死为 `games | office | tools`枚举。
- `进程`和`设置`始终是固定系统入口。
- 应用移动菜单和拖拽必须读取动态分组列表。
- 性能优化计划此前没有完成，新聊天应从性能优化第一阶段开始。
- 拖拽预览位置修正仍未完成，应与拖拽节流一起处理。
- 修改后必须执行 `npm run typecheck`和 `npm run build`。
- 涉及界面和 Electron IPC 时，需要进行生产版 Electron 烟测。