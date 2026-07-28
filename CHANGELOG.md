# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，版本号采用语义化版本。

## [未发布]

### 新增

- GitHub CI、草稿 Release 构建、SHA-256 发布校验和与公开问题模板。
- 设置页“关于与诊断”，可查看版本、打开数据目录和复制诊断信息。

### 安全

- Everything 与 ES 下载在解压执行前进行固定 SHA-256 校验。
- ES 更新到官方 `1.1.0.37` x64 版本。

### 修复

- 主界面默认保持普通权限；关闭应用会先尝试普通权限，仅在高权限目标仍在运行时按需请求 UAC，并复用本次会话授权。
- 会话级高权限进程控制 helper 和兼容终止路径均隐藏控制台窗口，并随主程序退出。
- Microsoft Store / MSIX 应用改用稳定 AUMID 启动；ChatGPT 等应用更新版本后会原位迁移旧 WindowsApps 路径，不再要求重新选择 EXE 或新增重复卡片。

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
