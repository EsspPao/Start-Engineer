# 贡献指南

感谢参与 Start Engineer。公开问题和拉取请求请保持范围清晰，并避免提交个人应用路径、配置数据或二进制构建产物。

## 开发环境

- Windows 10/11 x64
- Node.js 22+
- .NET SDK 8

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
```

## 提交要求

- 用户可见行为应补充或更新测试。
- 每次代码、配置、样式或构建流程改动都要同步更新 `PROJECT_OPTIMIZATION.md`。
- 每次改动验证后要重新生成安装版和便携版；不要提交 `release/`、`dist/`、`dist-electron/` 或 `dist-native/`。
- 保持普通权限 GUI 与高权限操作边界，不要为解决拖放问题让整个 Electron 应用长期提权。
- 不要削弱下载来源、SHA-256 校验、IPC 白名单或路径验证。

## Pull Request

说明问题、方案、验证命令和用户可见变化。涉及界面时附截图；涉及权限、下载、进程控制或本地数据时补充风险分析。
