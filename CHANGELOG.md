# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，版本号采用语义化版本。

## [未发布]

### 新增

- GitHub CI、草稿 Release 构建、SHA-256 发布校验和与公开问题模板。
- Dependabot 周期检查 npm 与 GitHub Actions 依赖。
- 设置页“关于与诊断”，可查看版本、打开数据目录和复制诊断信息。
- 设置页改为“偏好 / 分组管理”双页签：常用启动与外观设置保持可见，主题详情、高级设置、搜索依赖与诊断按需展开。
- 分组管理默认收起并保持单组展开；编辑和删除收进支持方向键、Esc 与焦点恢复的“更多操作”菜单。

### 安全

- Everything 与 ES 下载在解压执行前进行固定 SHA-256 校验。
- ES 更新到官方 `1.1.0.37` x64 版本。
- 主窗口启用 Chromium sandbox、CSP，并拒绝页面导航、新窗口和网页权限请求。
- 窗口 helper 改为 Windows x64 自包含单文件，移除 PDB 和本机源码路径，用户无需预装 .NET 8 Desktop Runtime。
- 升级到受支持的 Electron 43.3.0，并将 Vite、Vitest、React 构建插件和 electron-builder 更新到当前兼容版本；依赖锁统一使用 npm 官方源且安全审计为 0 个漏洞，打包复用 postinstall 已校验的 Electron 运行时，避免重复下载。
- GitHub Actions 构建步骤固定到官方仓库已核验的完整 commit SHA，降低浮动标签带来的供应链风险。

### 修复

- 主界面默认保持普通权限；关闭应用会先尝试普通权限，仅在高权限目标仍在运行时按需请求 UAC，并复用本次会话授权。
- 会话级高权限进程控制 helper 和兼容终止路径均隐藏控制台窗口，并随主程序退出。
- Microsoft Store / MSIX 应用改用稳定 AUMID 启动；ChatGPT 等应用更新版本后会原位迁移旧 WindowsApps 路径，不再要求重新选择 EXE 或新增重复卡片。
- 首次启动改为后台自动添加本机已有的默认推荐应用；缺失项静默跳过，不再显示额外选择界面，并避免并发扫描或用户手动添加时重复导入。
- 修复 Release 工作流标签版本校验和 PowerShell 资产通配符，使草稿 Release 能可靠创建。
- 构建前清理全部旧输出并阻止测试/已删除模块进入 `app.asar`；Windows x64 主 EXE 写入 Start Engineer 产品元数据和 `asInvoker` 权限级别。
- 已打包版本忽略首次导入 QA 标记，避免误进入隐藏测试配置。
- Windows 打包会定点清理旧 EXE、blockmap、builder 元数据与 `win-unpacked*` 目录；Release 流水线复用已验证构建，避免重复编译 helper 和陈旧产物混入交付目录。
- 复用已安装 Electron 运行时时会移除默认示例应用、版本占位文件和未启用的更新配置，避免无用文件进入公开包。
- 手动运行 Release 工作流只生成可下载构建，只有匹配版本的 `v*` 标签推送才允许创建草稿 Release；窗口 helper 的公开版本元数据不再附带源码提交哈希。
- 设置页不再重复显示全局搜索框；“关于”弹窗和分组更多菜单修复焦点、遮罩关闭及玻璃卡片层级问题。

### 优化

- Windows helper 移除整套 Windows Desktop Runtime，改为 .NET 8 Core 自包含裁剪单文件；保留快捷方式 COM、Store 图标、进程采集、窗口聚焦、启动与会话级高权限终止能力，用户仍无需安装 .NET。
- Electron 仅打包中文与英文回退语言，React 只参与前端构建且单独保留 MIT 许可证；未启用自动更新时关闭差分包并使用更高效的归档布局。
- 新增 helper 全协议烟测和 Windows 产物体积门槛。安装版由约 143.3 MiB 降至约 83.0 MiB，便携版由约 143.0 MiB 降至约 82.7 MiB。

## [0.1.0] - 2026-07-23

### 新增

- 应用分组、聚合应用视图、合并卡片与混合网格排序。
- 应用搜索、首次导入、资源管理器拖放和官方软件下载页入口。
- 应用启动、窗口唤起、进程监控和批量关闭。
- 可配置全局/应用内快捷键、托盘、开机启动和关闭行为。
- 多套玻璃主题、Wallpaper Glass、Clear Desktop、界面编辑器与分享码。
- 普通权限主界面与会话级高权限进程控制。

### 修复

- 修复透明图标黑底、长右键菜单超出视口、启动管理员应用失败等问题。
- 修复合并卡片键盘展开、成员选择和 `Esc` 收起行为。

[未发布]: https://github.com/EsspPao/Start-Engineer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/EsspPao/Start-Engineer/releases/tag/v0.1.0
