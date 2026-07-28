# 公开发布检查清单

本清单用于把已经验证的本地构建转成 GitHub 公共 Release。公开仓库、许可证授权和发布 Release 都必须由仓库所有者明确确认。

## 一次性设置

- [ ] 选择并添加 `LICENSE`；确认是否允许他人复制、修改和再分发。
- [ ] 将仓库可见性从 Private 改为 Public。
- [ ] 启用 Private vulnerability reporting。
- [ ] 为 `main` 启用分支保护，要求 `CI / verify` 通过后才能合并。
- [ ] 配置 Dependabot 或同等依赖告警。
- [ ] 购买 Windows 代码签名证书；把证书和密码保存为 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD` Actions secrets。
- [ ] 设置仓库描述、Topics 和可选主页链接。

没有签名证书时仍可发布预览版，但 README 和 Release Notes 必须明确提示 SmartScreen 风险，不能宣称已签名。

## 每次发布

- [ ] 更新 `package.json` 和 `package-lock.json` 中的版本。
- [ ] 将 `CHANGELOG.md` 的“未发布”内容移动到目标版本并填写日期。
- [ ] 更新 `PROJECT_OPTIMIZATION.md` 的验证基线和发布产物名称。
- [ ] 运行 `npm ci`。
- [ ] 运行 `npm run release:prepare`。
- [ ] 在干净 Windows x64 用户环境测试安装、首次启动、拖放、搜索、托盘、卸载和便携版启动。
- [ ] 用 `Get-AuthenticodeSignature` 检查签名状态（配置证书时必须为 `Valid`）。
- [ ] 用 `Get-FileHash` 与 `release/SHA256SUMS.txt` 交叉检查两个 EXE。
- [ ] 检查安装包与便携版不包含个人配置、日志、缓存或测试数据。
- [ ] 提交并推送发布准备改动，确认 GitHub CI 通过。
- [ ] 创建签名标签，例如 `git tag -s v0.1.0 -m "Start Engineer v0.1.0"`；没有 GPG 配置时至少创建 annotated tag。
- [ ] 推送标签：`git push origin v0.1.0`。
- [ ] 等待 `Build draft release` 生成草稿 Release。
- [ ] 下载 Actions 产物，在独立环境再次验证 SHA-256、签名和启动。
- [ ] 审核自动生成的发布说明后，手动发布草稿。

默认 `npm run package:win` 为兼容普通 Windows 开发环境而关闭可执行文件签名编辑。签名发布必须使用 `npm run package:win:signed`，或让 GitHub Release 工作流在检测到证书 Secrets 后自动选择该命令。

## 暂不自动化的检查

- Windows SmartScreen 信誉需要签名证书和真实发布积累，CI 无法代替。
- `npm audit` 会向 npm registry 发送依赖树；仅在仓库所有者明确授权后运行。
- 自动更新尚未实现。每个 Release 必须说明用户需要手动下载安装或替换便携版。
