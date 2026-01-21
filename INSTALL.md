# Git 测试清单生成器 - 安装和发布指南

## 📦 开发环境准备

### 1. 安装必要工具

```bash
# 安装 Node.js (v16+)
# 从 https://nodejs.org/ 下载安装

# 安装 vsce (VS Code Extension Manager)
npm install -g @vscode/vsce

# 验证安装
vsce --version
```

### 2. 项目初始化

```bash
cd vscode-extension
npm install
```

## 🔨 开发和测试

### 1. 本地开发调试

1. 在 VS Code 中打开 `vscode-extension` 文件夹
2. 按 `F5` 启动调试
3. 新窗口中会加载扩展
4. 测试各项功能

### 2. 运行 Lint 检查

```bash
npm run lint
```

## 📦 打包扩展

### 方法 1：快速打包（无需发布者账号）

```bash
cd vscode-extension
npm run package
```

这会在当前目录生成 `git-test-checklist-1.0.0.vsix` 文件。

### 方法 2：手动打包

```bash
vsce package
```

## 🚀 安装扩展

### 方法 1：通过 VS Code 安装

1. 打开 VS Code
2. 按 `Ctrl+Shift+P` 打开命令面板
3. 输入 "Extensions: Install from VSIX..."
4. 选择生成的 `.vsix` 文件
5. 重启 VS Code

### 方法 2：通过命令行安装

```bash
code --install-extension git-test-checklist-1.0.0.vsix
```

## 📤 发布到 VS Code Marketplace

### 1. 注册发布者账号

1. 访问 https://marketplace.visualstudio.com/
2. 点击右上角登录（使用 Microsoft 账号）
3. 访问 https://marketplace.visualstudio.com/manage
4. 点击 "Create Publisher"
5. 填写信息创建发布者 ID

### 2. 获取 Personal Access Token

1. 访问 https://dev.azure.com/
2. 点击右上角用户图标 → "Personal access tokens"
3. 点击 "New Token"
4. 设置：
   - Name: VS Code Extension Publishing
   - Organization: All accessible organizations
   - Scopes: 选择 "Marketplace" → "Manage"
5. 创建并保存 Token（只显示一次！）

### 3. 登录 vsce

```bash
vsce login <your-publisher-id>
# 输入 Personal Access Token
```

### 4. 更新 package.json

修改 `package.json` 中的 `publisher` 字段为你的发布者 ID：

```json
{
  "publisher": "your-publisher-id",
  ...
}
```

### 5. 发布扩展

```bash
# 首次发布
vsce publish

# 或指定版本号
vsce publish 1.0.0

# 发布补丁版本（自动增加版本号）
vsce publish patch  # 1.0.0 -> 1.0.1
vsce publish minor  # 1.0.0 -> 1.1.0
vsce publish major  # 1.0.0 -> 2.0.0
```

### 6. 更新扩展

```bash
# 修改代码后
vsce publish patch
```

## 🎨 添加扩展图标

1. 准备一个 128x128 的 PNG 图标
2. 保存为 `vscode-extension/images/icon.png`
3. 在 `package.json` 中已配置：
   ```json
   "icon": "images/icon.png"
   ```

## 📋 发布前检查清单

- [ ] 所有功能正常工作
- [ ] README.md 完整且准确
- [ ] 添加了扩展图标
- [ ] 更新了版本号
- [ ] 运行了 lint 检查
- [ ] 测试了在不同操作系统上的兼容性
- [ ] 添加了 LICENSE 文件
- [ ] 更新了 CHANGELOG

## 🔐 安全注意事项

1. **不要提交 Personal Access Token** 到 Git 仓库
2. **定期更新 Token**（建议每年更新）
3. **使用 .gitignore** 忽略敏感文件：
   ```
   *.vsix
   node_modules/
   .env
   ```

## 📝 版本管理最佳实践

### 语义化版本 (Semantic Versioning)

- **Major (主版本)**：不兼容的 API 变更
- **Minor (次版本)**：向下兼容的功能新增
- **Patch (补丁版本)**：向下兼容的问题修复

### 示例

```bash
# 修复 bug
vsce publish patch  # 1.0.0 -> 1.0.1

# 新增功能
vsce publish minor  # 1.0.1 -> 1.1.0

# 重大更新
vsce publish major  # 1.1.0 -> 2.0.0
```

## 🐛 常见问题

### 1. 打包失败：找不到文件

确保 `.vscodeignore` 正确配置，不要排除必需的文件。

### 2. 安装后扩展不显示

检查 `package.json` 中的 `activationEvents` 配置。

### 3. 命令不工作

确保命令已在 `package.json` 的 `contributes.commands` 中注册。

### 4. 发布失败：权限错误

确保 Personal Access Token 有正确的权限（Marketplace: Manage）。

### 5. Windows 上 PowerShell 脚本执行失败

确保项目中存在 `git-summary.ps1` 文件。

## 📚 相关资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [VS Code Marketplace](https://marketplace.visualstudio.com/)

## 🎯 快速开始（最快安装方式）

对于你的项目，最快的安装方式：

```bash
# 1. 进入扩展目录
cd vscode-extension

# 2. 安装依赖
npm install

# 3. 打包
npm run package

# 4. 安装（会自动安装到 VS Code）
code --install-extension git-test-checklist-1.0.0.vsix

# 5. 重启 VS Code
```

完成后，在 VS Code 中：
1. 打开你的项目（包含 git-summary.ps1 的目录）
2. 按 `Ctrl+Shift+P`
3. 输入 "Git 测试"
4. 选择任一命令开始使用！

## 💡 提示

- 首次使用建议选择 "生成测试清单 - 最近10次提交"
- 在侧边栏点击 ✅ 图标可以看到更多快捷操作
- 可以在设置中自定义默认行为
