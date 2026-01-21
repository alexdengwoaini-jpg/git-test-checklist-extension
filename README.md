# Git 测试清单生成器 - VS Code 扩展

一个强大的 VS Code 扩展，自动分析 Git 提交记录并生成智能测试清单。

## ✨ 功能特性

- 📝 **自动生成测试清单** - 根据 Git 提交历史自动生成详细的测试清单
- 🎯 **智能测试建议** - 根据提交信息和文件类型智能推荐测试项
- 🔍 **提交历史可视化** - 在 VS Code 中直接查看 Git 提交历史
- 📊 **侧边栏集成** - 专用侧边栏，快速访问所有功能
- ⚙️ **高度可配置** - 支持自定义提交数量、输出文件名等
- 🚀 **一键操作** - 命令面板和侧边栏双重入口

## 📦 安装方法

### 方法 1：从源码安装（开发版）

1. 安装 Node.js (v16 或更高版本)
2. 安装依赖：
   ```bash
   cd vscode-extension
   npm install
   ```
3. 打包扩展：
   ```bash
   npm run package
   ```
4. 在 VS Code 中安装 `.vsix` 文件：
   - 打开命令面板 (`Ctrl+Shift+P`)
   - 输入 "Extensions: Install from VSIX..."
   - 选择生成的 `.vsix` 文件

### 方法 2：从 VS Code 市场安装（待发布）

在 VS Code 扩展市场搜索 "Git 测试清单生成器"

## 🚀 使用方法

### 1. 命令面板

按 `Ctrl+Shift+P` 打开命令面板，输入以下命令：

- `Git 测试: 生成测试清单 - 最近10次提交`
- `Git 测试: 生成测试清单 - 最近20次提交`
- `Git 测试: 生成测试清单 - 最近30次提交`
- `Git 测试: 生成 Git 测试清单（自定义数量）`
- `Git 测试: 查看 Git 提交历史图`
- `Git 测试: 打开测试清单`
- `Git 测试: 查看提交详情`

### 2. 侧边栏

点击活动栏中的 ✅ 图标，打开 "Git 测试清单" 侧边栏：

**快速操作面板**：
- 生成测试清单 (10次)
- 生成测试清单 (20次)
- 生成测试清单 (30次)
- 自定义数量...
- 查看提交历史图
- 打开测试清单

**最近提交面板**：
- 显示最近 10 次提交
- 点击查看详细信息

### 3. Source Control 面板

在 Source Control 标题栏有快速生成按钮 ✅

## ⚙️ 配置选项

在 VS Code 设置中搜索 "Git 测试清单"：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `gitTestChecklist.defaultCommitCount` | number | 10 | 默认分析的提交数量 |
| `gitTestChecklist.outputFileName` | string | test-checklist.md | 输出文件名 |
| `gitTestChecklist.autoOpenAfterGenerate` | boolean | true | 生成后自动打开测试清单 |
| `gitTestChecklist.customTestRules` | object | {} | 自定义测试规则 |

### 配置示例

```json
{
  "gitTestChecklist.defaultCommitCount": 15,
  "gitTestChecklist.outputFileName": "my-test-checklist.md",
  "gitTestChecklist.autoOpenAfterGenerate": true,
  "gitTestChecklist.customTestRules": {
    "payment": ["测试支付流程", "验证支付回调"],
    "security": ["检查安全漏洞", "测试权限控制"]
  }
}
```

## 📋 生成的测试清单内容

生成的测试清单包含：

1. **提交概览**
   - 提交哈希、作者、日期
   - 修改的文件列表

2. **智能测试建议**
   - 根据提交信息自动识别
   - 根据文件类型推荐测试

3. **通用回归测试**
   - 核心功能测试
   - API 验证
   - 数据库迁移检查

4. **Git 命令参考**
   - 查看详细变更的命令

## 🎨 智能测试规则

扩展会根据以下规则自动生成测试建议：

### 提交信息关键词
- `fix`, `bug` → 验证 bug 修复、边界测试
- `user`, `login`, `auth` → 用户认证、权限测试
- `wechat`, `notification` → 微信通知测试
- `export`, `excel` → 数据导出测试
- `ticket`, `service` → 工单功能测试
- `database`, `sql`, `migration` → 数据库测试

### 文件类型
- `*Controller.cs` → API 端点测试
- `*Service.cs` → 业务逻辑测试
- `*.sql` → 数据库架构验证

## 📸 界面预览

### 侧边栏
```
Git 测试清单
├─ 快速操作
│  ├─ 生成测试清单 (10次)
│  ├─ 生成测试清单 (20次)
│  ├─ 生成测试清单 (30次)
│  ├─ 自定义数量...
│  ├─ 查看提交历史图
│  └─ 打开测试清单
└─ 最近提交
   ├─ 48cce7a: fix bulist
   ├─ 1dec44f: update wearer's role_name
   └─ ...
```

## 🔧 依赖要求

- VS Code 1.75.0 或更高版本
- Git（已安装并配置）
- PowerShell（Windows）或 Bash（Linux/Mac）
- 项目根目录需要有 `git-summary.ps1` 脚本

## 🐛 问题反馈

如遇到问题，请提供以下信息：
- VS Code 版本
- 扩展版本
- 操作系统
- 错误信息截图

## 📝 更新日志

### 1.0.0 (2026-01-21)
- ✨ 首次发布
- 📝 支持生成 Git 测试清单
- 🎯 智能测试建议
- 📊 侧边栏集成
- 🔍 提交历史查看

## 📄 许可证

MIT License

## 👨‍💻 作者

Alex Deng

## 🙏 致谢

感谢所有贡献者和使用者！
