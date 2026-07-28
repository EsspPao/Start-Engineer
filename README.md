# Start Engineer

[![CI](https://github.com/EsspPao/Start-Engineer/actions/workflows/ci.yml/badge.svg)](https://github.com/EsspPao/Start-Engineer/actions/workflows/ci.yml)

Start Engineer 是面向 Windows 10/11 x64 的桌面应用启动器与进程监控工具。它把常用软件整理为分组和合并卡片，提供快速搜索、窗口唤起、批量启动/关闭、运行状态与主题定制。

> 当前版本：`0.1.0`。安装包尚未进行商业代码签名，Windows SmartScreen 可能显示来源提示；请只从本仓库 Releases 下载并核对 SHA-256。

## 主要能力

- 按分组管理应用，拖动调整分组、应用和合并卡片顺序。
- 从文件选择器、搜索结果或资源管理器拖入 `.exe` / `.lnk`。
- Microsoft Store / MSIX 应用使用稳定 Windows 应用标识启动；ChatGPT 等应用更新包版本后无需重新选择 EXE。
- 单击唤起正在运行的应用；支持查看窗口列表和复制窗口诊断。
- 合并多个应用为卡片，键盘展开成员并批量启动。
- 显示受管应用的运行状态、CPU、内存、磁盘速率和 PID。
- 一键关闭应用、合并卡片、分组或全部受管应用。
- 主界面默认保持普通权限和资源管理器拖放能力；普通关闭失败且目标仍在运行时，才按需请求 UAC 关闭高权限进程。
- Everything 全盘搜索与内置应用/进程搜索；下载的 Everything/ES 会经过固定 SHA-256 校验。
- 多套玻璃主题、独立 Wallpaper Glass / Clear Desktop，以及可分享的界面布局码。
- 托盘、开机启动、全局快捷键和可配置应用内键盘操作。

## 下载与安装

在 [GitHub Releases](https://github.com/EsspPao/Start-Engineer/releases) 下载以下任一文件：

- `Start-Engineer-Setup-<version>.exe`：安装版，可选择安装目录并创建快捷方式。
- `Start-Engineer-Portable-<version>.exe`：免安装版。配置仍保存在当前 Windows 用户数据目录，替换 EXE 即可升级。
- `SHA256SUMS.txt`：发布文件校验和。

首次运行后可在“设置 → 关于与诊断”查看版本、打开数据目录或复制诊断信息。

## 快速使用

1. 进入一个分组，点击“添加应用”，或把资源管理器中的 `.exe` / `.lnk` 拖入窗口。
2. 单击卡片启动应用；应用已经运行时，单击会尝试唤起其窗口。
3. 将应用卡片拖到另一张应用卡片上可创建合并卡片。
4. 按 `Ctrl+F` 搜索，按 `Enter` 添加或打开选中的结果。

默认键盘操作：

| 操作 | 默认按键 |
| --- | --- |
| 全局显示/隐藏窗口 | `Ctrl+Shift+Space` |
| 移动卡片选择 | 方向键 |
| 启动应用 / 展开合并卡片 | `Enter` |
| 启动合并卡片全部应用 | `Ctrl+Enter` |
| 收起展开卡片 / 关闭浮层 | `Esc` |

## 权限与数据

- Start Engineer 默认以普通权限运行，避免破坏 Windows 资源管理器拖放。
- 关闭普通应用不会请求管理员权限；只有目标以更高权限运行、普通关闭失败且进程仍存在时，才会显示 Windows UAC。授权成功后，本次运行复用受限 helper，不再重复询问。
- 配置目录：`%APPDATA%\start-engineer`。
- 应用不要求账号，不包含遥测或云同步。完整说明见 [PRIVACY.md](PRIVACY.md)。

## Everything 搜索

选择 Everything 搜索后，可在设置中一键准备官方便携版与 ES 命令行工具。该操作只在用户主动触发时联网，文件来自 `voidtools.com`，校验通过后才会解压和启动。也可以手动选择已有的 `ES.exe`。

## Microsoft Store 应用

Start Engineer 会从 Windows 已注册应用中识别 Microsoft Store / MSIX 应用，并保存稳定的 Windows 应用标识（AUMID），而不是把版本号所在的 `WindowsApps` 路径当作永久地址。已有卡片若保存了旧版路径，会在下次启动该应用时自动迁移，原名称、分组、排序和合并卡片关系不变。

## 已知限制

- 当前仅构建和测试 Windows x64。
- 安装包尚未签名，也没有应用内自动更新；升级请从 Releases 下载新版本。
- 某些托盘应用、游戏启动器和多进程应用可能无法准确唤起窗口或识别全部子进程。
- 结束进程会中断未保存工作，请确认后再操作。

更多排查方法见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

## 本地开发

要求：Windows 10/11、Node.js 22+、npm、.NET SDK 8。

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
npm run dev
```

生成安装版、便携版与校验和：

```powershell
npm run release:prepare
```

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。
