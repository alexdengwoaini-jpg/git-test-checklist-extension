const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Git AI 自动化测试已激活');

    // 注册命令：生成测试清单（自定义数量）
    let generateCmd = vscode.commands.registerCommand('gitTestChecklist.generate', async () => {
        const count = await vscode.window.showInputBox({
            prompt: '请输入要分析的提交数量',
            placeHolder: '例如：10',
            value: '10',
            validateInput: (value) => {
                return isNaN(value) || parseInt(value) <= 0 ? '请输入有效的正整数' : null;
            }
        });

        if (count) {
            await generateTestChecklist(parseInt(count));
        }
    });

    // 注册命令：生成1次提交
    let generate1Cmd = vscode.commands.registerCommand('gitTestChecklist.generate1', async () => {
        await generateTestChecklist(1);
        await openTestChecklist();
    });

    // 注册命令：生成5次提交
    let generate5Cmd = vscode.commands.registerCommand('gitTestChecklist.generate5', async () => {
        await generateTestChecklist(5);
        await openTestChecklist();
    });

    // 注册命令：生成10次提交
    let generate10Cmd = vscode.commands.registerCommand('gitTestChecklist.generate10', async () => {
        await generateTestChecklist(10);
        await openTestChecklist();
    });

    // 注册命令：开启 Git 钩子
    let enableGitHookCmd = vscode.commands.registerCommand('gitTestChecklist.enableGitHook', async () => {
        await enableGitHook();
    });

    // 注册命令：关闭 Git 钩子
    let disableGitHookCmd = vscode.commands.registerCommand('gitTestChecklist.disableGitHook', async () => {
        await disableGitHook();
    });

    // 注册命令：查看提交历史
    let viewHistoryCmd = vscode.commands.registerCommand('gitTestChecklist.viewHistory', async () => {
        await viewGitHistory();
    });

    // 注册命令：打开测试清单
    let openChecklistCmd = vscode.commands.registerCommand('gitTestChecklist.openChecklist', async () => {
        await openTestChecklist();
    });

    // 注册命令：查看提交详情
    let viewCommitCmd = vscode.commands.registerCommand('gitTestChecklist.viewCommit', async (commitHash) => {
        if (!commitHash) {
            commitHash = await vscode.window.showInputBox({
                prompt: '请输入提交哈希值',
                placeHolder: '例如：48cce7a'
            });
        }
        if (commitHash) {
            await viewCommitDetails(commitHash);
        }
    });

    // 注册命令：增强版生成（含统计）
    let generateEnhancedCmd = vscode.commands.registerCommand('gitTestChecklist.generateEnhanced', async () => {
        const count = await vscode.window.showInputBox({
            prompt: '请输入要分析的提交数量',
            placeHolder: '例如：20',
            value: '20',
            validateInput: (value) => {
                return isNaN(value) || parseInt(value) <= 0 ? '请输入有效的正整数' : null;
            }
        });

        if (count) {
            await generateTestChecklist(parseInt(count), {
                includeStats: true,
                groupByAuthor: true
            });
        }
    });

    // 注册命令：按作者生成
    let generateByAuthorCmd = vscode.commands.registerCommand('gitTestChecklist.generateByAuthor', async () => {
        const author = await vscode.window.showInputBox({
            prompt: '请输入作者名字',
            placeHolder: '例如：ted'
        });

        if (!author) {
            vscode.window.showWarningMessage('作者名字不能为空');
            return;
        }

        const count = await vscode.window.showInputBox({
            prompt: '请输入要分析的提交数量',
            placeHolder: '例如：20',
            value: '20',
            validateInput: (value) => {
                return isNaN(value) || parseInt(value) <= 0 ? '请输入有效的正整数' : null;
            }
        });

        if (count) {
            await generateTestChecklist(parseInt(count), {
                author: author,
                includeStats: true
            });
        }
    });

    // 注册命令：按日期范围生成
    let generateByDateCmd = vscode.commands.registerCommand('gitTestChecklist.generateByDate', async () => {
        const since = await vscode.window.showInputBox({
            prompt: '请输入开始日期',
            placeHolder: '格式：yyyy-MM-dd，例如：2026-01-01',
            validateInput: (value) => {
                if (!value) return '开始日期不能为空';
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '日期格式错误，应为 yyyy-MM-dd';
                return null;
            }
        });

        if (!since) return;

        const until = await vscode.window.showInputBox({
            prompt: '请输入结束日期（可选，留空表示到今天）',
            placeHolder: '格式：yyyy-MM-dd，例如：2026-01-21',
            validateInput: (value) => {
                if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '日期格式错误，应为 yyyy-MM-dd';
                return null;
            }
        });

        await generateTestChecklist(100, {  // 日期范围模式使用较大的数量
            since: since,
            until: until || undefined,
            includeStats: true,
            groupByAuthor: true
        });
    });

    // 注册侧边栏 Webview
    const sidebarProvider = new SidebarViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitTestChecklistView', sidebarProvider)
    );
    
    // 刷新侧边栏
    vscode.commands.registerCommand('gitTestChecklist.refreshSidebar', () => {
        sidebarProvider.refresh();
    });

    // 监听 Git 变化，自动刷新侧边栏
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        // 创建文件监听器（监听 .git 目录变化）
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '.git/{HEAD,index,COMMIT_EDITMSG}')
        );
        
        // 防抖：避免频繁刷新
        let refreshTimeout;
        const debouncedRefresh = () => {
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                sidebarProvider.refresh();
                console.log('Git 变化检测到，侧边栏已刷新');
            }, 1000);
        };
        
        watcher.onDidChange(debouncedRefresh);
        watcher.onDidCreate(debouncedRefresh);
        
        context.subscriptions.push(watcher);
    }

    context.subscriptions.push(
        generateCmd,
        generate1Cmd,
        generate5Cmd,
        generate10Cmd,
        enableGitHookCmd,
        disableGitHookCmd,
        viewHistoryCmd,
        openChecklistCmd,
        viewCommitCmd,
        generateEnhancedCmd,
        generateByAuthorCmd,
        generateByDateCmd
    );
}

/**
 * 生成测试清单
 */
async function generateTestChecklist(count, options = {}) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace first');
        return;
    }

    const config = vscode.workspace.getConfiguration('gitTestChecklist');
    const outputFileName = config.get('outputFileName', 'test-checklist.md');
    const autoOpen = config.get('autoOpenAfterGenerate', true);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating test checklist (analyzing ${count} commits)...`,
        cancellable: false
    }, async (progress) => {
        try {
            const workspacePath = workspaceFolder.uri.fsPath;

            progress.report({ increment: 10, message: 'Getting commit history...' });

            // Build git log command
            let gitCmd = `git log --pretty=format:"%h|%an|%ar|%s" -${count}`;
            if (options.author) gitCmd += ` --author="${options.author}"`;
            if (options.since) gitCmd += ` --since="${options.since}"`;
            if (options.until) gitCmd += ` --until="${options.until}"`;

            // Get commits
            const { stdout: commitsOutput } = await execPromise(gitCmd, { cwd: workspacePath });
            
            if (!commitsOutput || commitsOutput.trim() === '') {
                vscode.window.showWarningMessage('No commits found matching criteria');
                return;
            }

            const commits = commitsOutput.trim().split('\n').filter(line => line.trim());
            
            progress.report({ increment: 30, message: `Analyzing ${commits.length} commits...` });

            // Initialize output and stats
            let output = [];
            const stats = { authors: {}, totalFiles: 0 };
            const allCommitData = [];

            output.push('# Git 提交测试清单');
            output.push('');
            output.push(`生成时间: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} | 分析提交数: ${commits.length}`);
            if (options.author) output.push(`作者筛选: ${options.author}`);
            if (options.since) output.push(`日期范围: ${options.since} ~ ${options.until || '至今'}`);
            output.push('');
            output.push('---');
            output.push('');

            // 测试规则（详细中文，包含功能说明）
            const testRules = {
                'fix|bug|修复|修改|bugfix': {
                    feature: '缺陷修复',
                    tests: [
                        '验证原始 Bug 问题是否已解决',
                        '测试修复后的正常业务流程',
                        '边界条件和异常输入测试',
                        '回归测试：确保修复未影响其他功能'
                    ]
                },
                'user|login|auth|用户|登录|认证|注册|密码': {
                    feature: '用户认证模块',
                    tests: [
                        '用户登录/注册流程测试',
                        '密码强度验证和加密测试',
                        '用户角色和权限控制测试',
                        'Token/Session 有效期测试',
                        '多端登录和踢出机制测试'
                    ]
                },
                'wechat|notification|message|微信|通知|消息|推送|短信|邮件': {
                    feature: '消息通知模块',
                    tests: [
                        '消息发送成功率测试',
                        '消息内容格式和模板验证',
                        '消息推送延迟测试',
                        '消息状态回调处理测试',
                        '批量发送性能测试'
                    ]
                },
                'export|excel|import|导出|导入|download|upload|上传|下载': {
                    feature: '数据导入导出模块',
                    tests: [
                        '数据导出格式正确性验证',
                        '大数据量导出性能测试',
                        '导入数据校验和错误提示',
                        '导入数据完整性验证',
                        '文件格式兼容性测试(xlsx/csv/pdf)'
                    ]
                },
                'ticket|service|order|工单|服务|订单|流程|审批': {
                    feature: '工单/订单管理模块',
                    tests: [
                        '工单创建和提交流程测试',
                        '工单状态流转测试(待处理→处理中→已完成)',
                        '工单分配和转派功能测试',
                        '工单查询和筛选功能测试',
                        '工单超时提醒和升级测试'
                    ]
                },
                'database|sql|migration|数据库|表|字段|索引': {
                    feature: '数据库变更',
                    tests: [
                        '数据库迁移脚本执行验证',
                        '新增字段默认值验证',
                        '索引创建和查询性能测试',
                        '数据完整性和约束测试',
                        '数据库回滚脚本测试'
                    ]
                },
                'payment|pay|支付|退款|账单|余额|钱包': {
                    feature: '支付财务模块',
                    tests: [
                        '支付流程完整性测试',
                        '支付回调处理测试',
                        '退款流程和状态测试',
                        '账单生成和对账测试',
                        '支付异常处理(超时/失败)测试'
                    ]
                },
                'api|接口|endpoint|request|response': {
                    feature: 'API 接口',
                    tests: [
                        'API 请求参数校验测试',
                        'API 响应数据格式验证',
                        'API 错误码和异常处理测试',
                        'API 权限和鉴权测试',
                        'API 性能和并发测试'
                    ]
                },
                'security|安全|权限|加密|xss|csrf|注入': {
                    feature: '安全模块',
                    tests: [
                        'SQL 注入漏洞测试',
                        'XSS 跨站脚本攻击测试',
                        'CSRF 跨站请求伪造测试',
                        '敏感数据加密存储验证',
                        '接口权限控制测试'
                    ]
                },
                'feat|feature|新增|添加|新功能': {
                    feature: '新功能开发',
                    tests: [
                        '新功能完整业务流程测试',
                        '新功能边界条件测试',
                        '新功能与现有功能兼容性测试',
                        '新功能性能基准测试',
                        '新功能用户体验测试'
                    ]
                },
                'refactor|重构|优化|performance|性能': {
                    feature: '代码重构/性能优化',
                    tests: [
                        '重构后功能一致性验证',
                        '重构前后性能对比测试',
                        '接口响应时间测试',
                        '内存和资源占用测试',
                        '高并发压力测试'
                    ]
                },
                'style|样式|UI|ui|css|界面|布局|颜色': {
                    feature: 'UI 界面样式',
                    tests: [
                        'UI 界面显示正确性检查',
                        '不同分辨率适配测试',
                        '移动端/PC端兼容性测试',
                        '主题切换(深色/浅色)测试',
                        '交互动画和过渡效果测试'
                    ]
                },
                'config|配置|setting|参数|环境': {
                    feature: '配置管理',
                    tests: [
                        '配置项生效验证',
                        '配置热更新测试',
                        '不同环境配置切换测试',
                        '配置默认值验证',
                        '配置项边界值测试'
                    ]
                },
                'cache|缓存|redis|memory': {
                    feature: '缓存模块',
                    tests: [
                        '缓存读写正确性测试',
                        '缓存过期策略测试',
                        '缓存穿透/击穿/雪崩测试',
                        '缓存与数据库一致性测试',
                        '缓存清理和刷新测试'
                    ]
                },
                'log|日志|audit|审计|记录': {
                    feature: '日志审计模块',
                    tests: [
                        '日志记录完整性验证',
                        '日志格式和内容正确性',
                        '敏感信息脱敏测试',
                        '日志查询和筛选测试',
                        '日志存储和清理策略测试'
                    ]
                },
                'report|报表|统计|chart|图表|dashboard': {
                    feature: '报表统计模块',
                    tests: [
                        '报表数据准确性验证',
                        '报表生成性能测试',
                        '图表展示正确性测试',
                        '报表导出功能测试',
                        '报表筛选条件测试'
                    ]
                }
            };

            // 收集所有提交数据
            let commitCount = 0;
            for (const commit of commits) {
                if (!commit) continue;
                
                commitCount++;
                const parts = commit.split('|');
                const hash = parts[0] || '';
                const author = parts[1] || '';
                const date = parts[2] || '';
                const message = parts.slice(3).join('|') || '';

                // Collect stats
                if (!stats.authors[author]) stats.authors[author] = 0;
                stats.authors[author]++;

                // Get changed files
                let changedFiles = [];
                try {
                    const { stdout: fileStats } = await execPromise(
                        `git show --stat --pretty=format:"" ${hash}`,
                        { cwd: workspacePath }
                    );
                    
                    const lines = fileStats.split('\n');
                    for (const line of lines) {
                        const match = line.match(/^\s*(.+?)\s+\|/);
                        if (match) {
                            changedFiles.push(match[1].trim());
                            stats.totalFiles++;
                        }
                    }
                } catch (e) {
                    // Skip file stats if error
                }

                // Generate test suggestions
                const tests = [];
                const features = [];
                const msgLower = message.toLowerCase();

                for (const [pattern, ruleData] of Object.entries(testRules)) {
                    if (new RegExp(pattern, 'i').test(msgLower)) {
                        if (!features.includes(ruleData.feature)) {
                            features.push(ruleData.feature);
                        }
                        // 添加前2-3个最相关的测试项
                        const relevantTests = ruleData.tests.slice(0, 3);
                        for (const test of relevantTests) {
                            if (!tests.includes(test)) {
                                tests.push(test);
                            }
                        }
                    }
                }

                // 根据文件类型添加测试建议
                for (const file of changedFiles) {
                    const fileName = file.toLowerCase();
                    
                    if (/controller\.(cs|java|ts|js)$/i.test(file)) {
                        if (!features.includes('API 接口')) features.push('API 接口');
                        if (!tests.includes('API 请求参数校验测试')) tests.push('API 请求参数校验测试');
                        if (!tests.includes('API 响应数据格式验证')) tests.push('API 响应数据格式验证');
                    }
                    if (/service\.(cs|java|ts|js)$/i.test(file)) {
                        if (!features.includes('业务逻辑层')) features.push('业务逻辑层');
                        if (!tests.includes('业务逻辑正确性测试')) tests.push('业务逻辑正确性测试');
                    }
                    if (/repository|dao|mapper/i.test(fileName)) {
                        if (!features.includes('数据访问层')) features.push('数据访问层');
                        if (!tests.includes('数据库操作正确性测试')) tests.push('数据库操作正确性测试');
                    }
                    if (/\.sql$/i.test(file)) {
                        if (!features.includes('数据库脚本')) features.push('数据库脚本');
                        if (!tests.includes('SQL 脚本执行验证')) tests.push('SQL 脚本执行验证');
                        if (!tests.includes('数据迁移完整性测试')) tests.push('数据迁移完整性测试');
                    }
                    if (/\.(css|scss|less)$/i.test(file)) {
                        if (!features.includes('样式文件')) features.push('样式文件');
                        if (!tests.includes('页面样式显示检查')) tests.push('页面样式显示检查');
                    }
                    if (/\.(vue|jsx|tsx)$/i.test(file)) {
                        if (!features.includes('前端组件')) features.push('前端组件');
                        if (!tests.includes('组件渲染和交互测试')) tests.push('组件渲染和交互测试');
                        if (!tests.includes('组件状态管理测试')) tests.push('组件状态管理测试');
                    }
                    if (/\.json$/i.test(file) && /config|setting|package/i.test(fileName)) {
                        if (!features.includes('配置文件')) features.push('配置文件');
                        if (!tests.includes('配置项生效验证')) tests.push('配置项生效验证');
                    }
                    if (/test|spec/i.test(fileName)) {
                        if (!features.includes('测试用例')) features.push('测试用例');
                        if (!tests.includes('单元测试覆盖率检查')) tests.push('单元测试覆盖率检查');
                    }
                    if (/util|helper|common/i.test(fileName)) {
                        if (!features.includes('工具函数')) features.push('工具函数');
                        if (!tests.includes('工具函数单元测试')) tests.push('工具函数单元测试');
                    }
                    if (/model|entity|dto|vo/i.test(fileName)) {
                        if (!features.includes('数据模型')) features.push('数据模型');
                        if (!tests.includes('数据模型字段验证')) tests.push('数据模型字段验证');
                    }
                }

                // 如果没有匹配到任何规则，添加通用测试
                if (tests.length === 0) {
                    tests.push('功能正确性验证');
                    tests.push('回归测试');
                }

                allCommitData.push({
                    index: commitCount,
                    hash,
                    author,
                    date,
                    message,
                    files: changedFiles,
                    features: features,
                    tests: [...new Set(tests)]
                });

                progress.report({ 
                    increment: 40 / commits.length, 
                    message: `处理提交 ${commitCount}/${commits.length}...` 
                });
            }

            // 输出提交汇总表格
            output.push('## 提交汇总');
            output.push('');
            output.push('| 序号 | 哈希 | 作者 | 时间 | 提交信息 | 变更文件数 |');
            output.push('|:----:|------|------|------|----------|:----------:|');
            for (const c of allCommitData) {
                output.push(`| ${c.index} | \`${c.hash}\` | ${c.author} | ${c.date} | ${c.message} | ${c.files.length} |`);
            }
            output.push('');
            output.push('---');
            output.push('');

            // 输出变更文件汇总表格
            output.push('## 变更文件汇总');
            output.push('');
            output.push('| 提交哈希 | 提交信息 | 文件路径 | 文件类型 |');
            output.push('|----------|----------|----------|----------|');
            for (const c of allCommitData) {
                for (let i = 0; i < c.files.length; i++) {
                    const file = c.files[i];
                    // 获取文件类型
                    let fileType = '其他';
                    if (/\.(js|ts|jsx|tsx)$/i.test(file)) fileType = 'JavaScript/TypeScript';
                    else if (/\.(css|scss|less)$/i.test(file)) fileType = '样式文件';
                    else if (/\.(html|vue)$/i.test(file)) fileType = '页面/组件';
                    else if (/\.(json|xml|yaml|yml)$/i.test(file)) fileType = '配置文件';
                    else if (/\.(sql)$/i.test(file)) fileType = 'SQL脚本';
                    else if (/\.(md|txt)$/i.test(file)) fileType = '文档';
                    else if (/\.(jpg|png|gif|svg)$/i.test(file)) fileType = '图片';
                    else if (/\.(cs|java)$/i.test(file)) fileType = '后端代码';
                    
                    if (i === 0) {
                        output.push(`| \`${c.hash}\` | ${c.message} | \`${file}\` | ${fileType} |`);
                    } else {
                        output.push(`| | | \`${file}\` | ${fileType} |`);
                    }
                }
            }
            output.push('');
            output.push('---');
            output.push('');

            // 输出测试建议表格
            output.push('## 测试建议');
            output.push('');
            output.push('| 提交哈希 | 提交信息 | 涉及功能模块 | 建议测试项 | 状态 |');
            output.push('|----------|----------|--------------|------------|:----:|');
            for (const c of allCommitData) {
                const featureStr = c.features && c.features.length > 0 ? c.features.join('、') : '通用';
                if (c.tests.length === 0) {
                    output.push(`| \`${c.hash}\` | ${c.message} | ${featureStr} | 功能正确性验证 | [ ] |`);
                } else {
                    for (let i = 0; i < c.tests.length; i++) {
                        if (i === 0) {
                            output.push(`| \`${c.hash}\` | ${c.message} | ${featureStr} | ${c.tests[i]} | [ ] |`);
                        } else {
                            output.push(`| | | | ${c.tests[i]} | [ ] |`);
                        }
                    }
                }
            }
            output.push('');
            output.push('---');
            output.push('');

            // 通用回归测试
            output.push('## 通用回归测试');
            output.push('');
            output.push('| 测试项 | 状态 |');
            output.push('|--------|:----:|');
            output.push('| 核心功能回归 | [ ] |');
            output.push('| 用户登录认证 | [ ] |');
            output.push('| 数据导入导出 | [ ] |');
            output.push('| API 响应验证 | [ ] |');
            output.push('| 数据库完整性 | [ ] |');
            output.push('');

            // 添加统计信息
            if (options.includeStats) {
                output.push('---');
                output.push('');
                output.push('## 统计信息');
                output.push('');
                output.push('| 指标 | 数值 |');
                output.push('|------|------|');
                output.push(`| 总提交数 | ${commitCount} |`);
                output.push(`| 变更文件数 | ${stats.totalFiles} |`);
                output.push(`| 贡献者数 | ${Object.keys(stats.authors).length} |`);
                output.push('');

                output.push('### 作者贡献');
                output.push('');
                output.push('| 作者 | 提交数 | 占比 |');
                output.push('|------|--------|------|');
                const sortedAuthors = Object.entries(stats.authors).sort((a, b) => b[1] - a[1]);
                for (const [author, cnt] of sortedAuthors) {
                    const percentage = ((cnt / commitCount) * 100).toFixed(1);
                    output.push(`| ${author} | ${cnt} | ${percentage}% |`);
                }
                output.push('');
            }

            // 按作者分组
            if (options.groupByAuthor && commits.length > 0) {
                output.push('---');
                output.push('');
                output.push('## 按作者分组');
                output.push('');

                const authorGroups = {};
                for (const c of allCommitData) {
                    if (!authorGroups[c.author]) authorGroups[c.author] = [];
                    authorGroups[c.author].push(c);
                }

                for (const [author, authorCommits] of Object.entries(authorGroups)) {
                    output.push(`### ${author}（${authorCommits.length} 次提交）`);
                    output.push('');
                    output.push('| 哈希 | 提交信息 | 时间 | 文件数 |');
                    output.push('|------|----------|------|:------:|');
                    for (const c of authorCommits) {
                        output.push(`| \`${c.hash}\` | ${c.message} | ${c.date} | ${c.files.length} |`);
                    }
                    output.push('');
                }
            }

            output.push('---');
            output.push('');
            output.push('由 Git AI 自动化测试 生成 · 作者：Alex Deng');
            output.push('');

            progress.report({ increment: 20, message: 'Saving file...' });

            // Save to file
            const checklistPath = path.join(workspacePath, outputFileName);
            fs.writeFileSync(checklistPath, output.join('\n'), 'utf8');

            progress.report({ increment: 10, message: 'Done!' });

            vscode.window.showInformationMessage(`✅ Test checklist generated! Analyzed ${commitCount} commits`);

            // Auto open the file
            if (autoOpen) {
                const document = await vscode.workspace.openTextDocument(checklistPath);
                await vscode.window.showTextDocument(document, { preview: false });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
            console.error(error);
        }
    });
}

/**
 * 查看 Git 提交历史
 */
async function viewGitHistory() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    try {
        const { stdout } = await execPromise(
            'git log --graph --oneline --all --decorate -20',
            { cwd: workspaceFolder.uri.fsPath }
        );

        const panel = vscode.window.createWebviewPanel(
            'gitHistory',
            'Git 提交历史',
            vscode.ViewColumn.Two,
            {}
        );

        panel.webview.html = getHistoryHtml(stdout);
    } catch (error) {
        vscode.window.showErrorMessage(`查看历史失败: ${error.message}`);
    }
}

/**
 * 查看提交详情
 */
async function viewCommitDetails(commitHash) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    try {
        const { stdout } = await execPromise(
            `git show ${commitHash}`,
            { cwd: workspaceFolder.uri.fsPath }
        );

        const panel = vscode.window.createWebviewPanel(
            'commitDetails',
            `提交详情: ${commitHash}`,
            vscode.ViewColumn.Two,
            {}
        );

        panel.webview.html = getCommitDetailsHtml(stdout, commitHash);
    } catch (error) {
        vscode.window.showErrorMessage(`查看提交失败: ${error.message}`);
    }
}

/**
 * 打开测试清单
 */
async function openTestChecklist() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const config = vscode.workspace.getConfiguration('gitTestChecklist');
    const outputFileName = config.get('outputFileName', 'test-checklist.md');
    const checklistPath = path.join(workspaceFolder.uri.fsPath, outputFileName);

    if (!fs.existsSync(checklistPath)) {
        const generate = await vscode.window.showWarningMessage(
            '测试清单文件不存在，是否立即生成？',
            '生成',
            '取消'
        );
        if (generate === '生成') {
            await generateTestChecklist(10);
        }
        return;
    }

    // 读取清单内容
    const content = fs.readFileSync(checklistPath, 'utf8');
    
    const panel = vscode.window.createWebviewPanel(
        'testChecklist',
        '测试清单',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getChecklistHtml(content);
}

/**
 * 获取测试清单 HTML
 */
function getChecklistHtml(markdownContent) {
    // 解析 markdown 内容
    const lines = markdownContent.split('\n');
    let html = '';
    let inCodeBlock = false;
    let inTable = false;
    let tableRows = [];
    let stats = { total: 0, checked: 0, commits: 0 };
    
    // 处理表格
    function processTable() {
        if (tableRows.length < 2) return '';
        
        let tableHtml = '<table>';
        tableRows.forEach((row, idx) => {
            // 跳过分隔行 |---|---|
            if (row.match(/^\|[\s\-:]+\|$/)) return;
            if (row.match(/^\|[\s\-:|]+\|$/)) return;
            
            const cells = row.split('|').filter((c, i, arr) => i > 0 && i < arr.length - 1);
            const tag = idx === 0 ? 'th' : 'td';
            
            tableHtml += '<tr>';
            cells.forEach(cell => {
                let cellContent = cell.trim();
                // 处理代码块
                cellContent = cellContent.replace(/`([^`]+)`/g, '<code>$1</code>');
                // 处理复选框
                if (cellContent === '[ ]') {
                    stats.total++;
                    cellContent = '<input type="checkbox" onchange="updateStats()">';
                } else if (cellContent === '[x]') {
                    stats.total++;
                    stats.checked++;
                    cellContent = '<input type="checkbox" checked onchange="updateStats()">';
                }
                tableHtml += `<${tag}>${cellContent}</${tag}>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</table>';
        return tableHtml;
    }
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            if (inCodeBlock) {
                html += '<pre class="code">';
            } else {
                html += '</pre>';
            }
            continue;
        }
        
        if (inCodeBlock) {
            html += escapeHtml(line) + '\n';
            continue;
        }
        
        // 检测表格行
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(line);
            continue;
        } else if (inTable) {
            // 表格结束
            html += processTable();
            inTable = false;
            tableRows = [];
        }
        
        // 标题
        if (line.startsWith('# ')) {
            html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
        } else if (line.startsWith('## ')) {
            html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
        } else if (line.startsWith('### ')) {
            stats.commits++;
            html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
        } else if (line.startsWith('- [ ] ')) {
            stats.total++;
            html += `<div class="checkbox"><input type="checkbox" onchange="updateStats()"><span>${escapeHtml(line.slice(6))}</span></div>`;
        } else if (line.startsWith('- [x] ')) {
            stats.total++;
            stats.checked++;
            html += `<div class="checkbox"><input type="checkbox" checked onchange="updateStats()"><span class="done">${escapeHtml(line.slice(6))}</span></div>`;
        } else if (line.startsWith('- **')) {
            const match = line.match(/- \*\*(.+?)\*\*:?\s*(.*)/);
            if (match) {
                html += `<div class="meta"><strong>${escapeHtml(match[1])}</strong>${match[2] ? ': ' + escapeHtml(match[2]) : ''}</div>`;
            }
        } else if (line.startsWith('- `')) {
            html += `<div class="file">${line.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^- /, '')}</div>`;
        } else if (line.startsWith('**') && line.includes('**:')) {
            const match = line.match(/\*\*(.+?)\*\*:?\s*(.*)/);
            if (match) {
                html += `<div class="info"><strong>${escapeHtml(match[1])}</strong>${match[2] ? ': ' + escapeHtml(match[2]) : ''}</div>`;
            }
        } else if (line.startsWith('---')) {
            html += '<hr>';
        } else if (line.startsWith('>')) {
            html += `<blockquote>${escapeHtml(line.slice(1).trim())}</blockquote>`;
        } else if (line.trim()) {
            html += `<p>${escapeHtml(line)}</p>`;
        }
    }
    
    // 处理最后的表格
    if (inTable && tableRows.length > 0) {
        html += processTable();
    }

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; min-height: 100vh; color: #1e293b; font-size: 11px; }
.container { max-width: 100%; margin: 0 auto; padding: 8px 12px; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
.logo { width: 24px; height: 24px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.logo svg { width: 12px; height: 12px; color: white; }
.title { font-size: 13px; font-weight: 600; color: #065f46; }
.subtitle { font-size: 10px; color: #059669; margin-left: auto; }
.stats-bar { display: flex; gap: 8px; margin-bottom: 6px; }
.stat { background: white; padding: 4px 10px; border-radius: 4px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 4px; }
.stat-num { font-size: 13px; font-weight: 600; color: #059669; }
.stat-label { font-size: 10px; color: #6b7280; }
.progress-bar { flex: 1; background: white; padding: 4px 10px; border-radius: 4px; border: 1px solid #e2e8f0; }
.progress-track { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: #10b981; border-radius: 2px; transition: width 0.3s; }
.progress-text { font-size: 10px; color: #6b7280; margin-top: 2px; }
.card { background: white; border-radius: 6px; border: 1px solid #e2e8f0; overflow: hidden; max-height: calc(100vh - 80px); overflow-y: auto; }
.content { padding: 8px; }
h1 { font-size: 12px; color: #065f46; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; display: none; }
h2 { font-size: 11px; color: #047857; margin: 6px 0 4px; padding: 4px 8px; background: #f0fdf4; border-radius: 3px; border-left: 2px solid #10b981; font-weight: 600; }
h3 { font-size: 10px; color: #059669; margin: 4px 0 2px; font-weight: 500; }
p { font-size: 10px; color: #6b7280; margin: 2px 0; line-height: 1.3; }
hr { border: none; height: 1px; background: #e2e8f0; margin: 6px 0; }
.checkbox { display: flex; align-items: center; gap: 4px; padding: 2px 0; font-size: 10px; }
.checkbox input { accent-color: #10b981; width: 12px; height: 12px; }
.checkbox .done { text-decoration: line-through; color: #9ca3af; }
.meta, .file, .info { font-size: 10px; color: #6b7280; padding: 1px 0; }
.meta strong, .info strong { color: #374151; }
.file code { background: #f0fdf4; color: #059669; padding: 0 3px; border-radius: 2px; font-family: monospace; font-size: 9px; }
.code { background: #1e293b; color: #e2e8f0; padding: 6px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; overflow-x: auto; margin: 4px 0; }
table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 10px; border: 1px solid #d1d5db; }
th { padding: 5px 6px; text-align: left; background: #10b981; color: white; font-weight: 500; font-size: 10px; border: 1px solid #059669; position: sticky; top: 0; white-space: nowrap; }
td { padding: 4px 6px; background: white; border: 1px solid #e5e7eb; color: #374151; line-height: 1.3; }
tr:nth-child(even) td { background: #f9fafb; }
tr:hover td { background: #ecfdf5; }
td code { background: #f3f4f6; color: #1f2937; padding: 1px 4px; border-radius: 2px; font-family: 'Consolas', monospace; font-size: 9px; }
td input[type="checkbox"] { width: 14px; height: 14px; accent-color: #10b981; cursor: pointer; }
blockquote { background: #f0fdf4; border-left: 2px solid #10b981; padding: 4px 8px; margin: 4px 0; font-size: 10px; color: #065f46; }
.footer { text-align: center; padding: 4px; font-size: 9px; color: #9ca3af; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #f1f5f9; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></div>
        <span class="title">Git 测试清单</span>
        <span class="subtitle">by Alex Deng</span>
        <div class="stat"><span class="stat-num" id="total">${stats.total}</span><span class="stat-label">测试项</span></div>
        <div class="stat"><span class="stat-num" id="checked">${stats.checked}</span><span class="stat-label">已完成</span></div>
    </div>
    <div class="card"><div class="content">${html}</div></div>
    <div class="footer">Git AI 自动化测试 · Alex Deng</div>
</div>
<script>
function updateStats() {
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    let checked = 0;
    cbs.forEach(cb => { if (cb.checked) checked++; });
    document.getElementById('checked').textContent = checked;
}
</script>
</body></html>`;
}

/**
 * 获取历史记录 HTML
 */
function getHistoryHtml(gitLog) {
    const lines = gitLog.split('\n').filter(line => line.trim());
    
    let commitsHtml = '';
    lines.forEach((line) => {
        const match = line.match(/^([*|\\\/\s]+)\s*([a-f0-9]+)\s*(?:\(([^)]+)\))?\s*(.*)$/);
        if (match) {
            const [, graph, hash, branches, message] = match;
            const branchBadges = branches ? branches.split(',').map(b => 
                `<span class="badge">${b.trim()}</span>`
            ).join('') : '';
            
            commitsHtml += `
                <div class="row">
                    <span class="graph">${escapeHtml(graph)}</span>
                    <span class="hash">${hash}</span>
                    <span class="branches">${branchBadges}</span>
                    <span class="msg">${escapeHtml(message)}</span>
                </div>`;
        } else {
            commitsHtml += `<div class="row"><span class="graph">${escapeHtml(line)}</span></div>`;
        }
    });

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); min-height: 100vh; color: #1e293b; }
.container { max-width: 1000px; margin: 0 auto; padding: 20px; }
.header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e9d5ff; }
.logo { width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6, #a855f7); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.logo svg { width: 18px; height: 18px; color: white; }
.title { font-size: 18px; font-weight: 700; color: #581c87; }
.subtitle { font-size: 11px; color: #9333ea; margin-left: auto; }
.card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1); border: 1px solid #e9d5ff; overflow: hidden; }
.card-header { padding: 10px 16px; background: linear-gradient(to right, #faf5ff, #f5f3ff); border-bottom: 1px solid #e9d5ff; display: flex; align-items: center; gap: 8px; }
.card-icon { width: 24px; height: 24px; background: linear-gradient(135deg, #8b5cf6, #a855f7); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.card-icon svg { width: 12px; height: 12px; color: white; }
.card-title { font-size: 13px; font-weight: 600; color: #6b21a8; }
.commits { max-height: 70vh; overflow-y: auto; }
.row { display: grid; grid-template-columns: 100px 60px auto 1fr; align-items: center; padding: 8px 16px; gap: 10px; border-bottom: 1px solid #f5f3ff; font-size: 12px; }
.row:hover { background: #faf5ff; }
.graph { font-family: monospace; color: #8b5cf6; white-space: pre; font-size: 11px; }
.hash { font-family: monospace; font-size: 10px; color: #7c3aed; background: #ede9fe; padding: 2px 6px; border-radius: 4px; text-align: center; }
.branches { display: flex; gap: 4px; flex-wrap: wrap; }
.badge { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 10px; background: #fef3c7; color: #b45309; }
.badge:nth-child(2n) { background: #dcfce7; color: #15803d; }
.badge:nth-child(3n) { background: #ede9fe; color: #7c3aed; }
.msg { color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats { padding: 10px 16px; background: #faf5ff; border-top: 1px solid #e9d5ff; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #7c3aed; }
.stats strong { color: #581c87; font-size: 14px; }
.footer { text-align: center; padding: 12px; font-size: 10px; color: #a78bfa; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #f5f3ff; }
::-webkit-scrollbar-thumb { background: #c4b5fd; border-radius: 3px; }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg></div>
        <span class="title">Git 提交历史</span>
        <span class="subtitle">by Alex Deng</span>
    </div>
    <div class="card">
        <div class="card-header">
            <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><line x1="1" y1="12" x2="7" y2="12"></line><line x1="17" y1="12" x2="23" y2="12"></line></svg></div>
            <span class="card-title">提交图谱</span>
        </div>
        <div class="commits">${commitsHtml}</div>
        <div class="stats"><strong>${lines.length}</strong> 条提交记录</div>
    </div>
    <div class="footer">Git AI 自动化测试</div>
</div>
</body></html>`;
}

/**
 * 获取提交详情 HTML
 */
function getCommitDetailsHtml(details, commitHash) {
    // 解析 git show 输出
    const lines = details.split('\n');
    let commitInfo = {
        hash: commitHash,
        author: '',
        date: '',
        message: '',
        stats: { additions: 0, deletions: 0, files: [] }
    };
    
    let diffContent = [];
    let inDiff = false;
    let currentFile = null;
    let messageLines = [];
    let inMessage = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('Author:')) {
            commitInfo.author = line.replace('Author:', '').trim();
        } else if (line.startsWith('Date:')) {
            commitInfo.date = line.replace('Date:', '').trim();
        } else if (line.startsWith('commit ')) {
            commitInfo.hash = line.replace('commit ', '').trim();
        } else if (line.startsWith('diff --git')) {
            inDiff = true;
            inMessage = false;
            const match = line.match(/diff --git a\/(.+) b\/(.+)/);
            if (match) {
                currentFile = { name: match[2], additions: 0, deletions: 0, hunks: [] };
                commitInfo.stats.files.push(currentFile);
            }
            diffContent.push({ type: 'file-header', content: line, file: currentFile?.name });
        } else if (line.startsWith('@@')) {
            diffContent.push({ type: 'hunk-header', content: line });
        } else if (inDiff && line.startsWith('+') && !line.startsWith('+++')) {
            diffContent.push({ type: 'addition', content: line });
            if (currentFile) {
                currentFile.additions++;
                commitInfo.stats.additions++;
            }
        } else if (inDiff && line.startsWith('-') && !line.startsWith('---')) {
            diffContent.push({ type: 'deletion', content: line });
            if (currentFile) {
                currentFile.deletions++;
                commitInfo.stats.deletions++;
            }
        } else if (inDiff) {
            diffContent.push({ type: 'context', content: line });
        } else if (line.startsWith('    ') && !inDiff) {
            inMessage = true;
            messageLines.push(line.trim());
        }
    }
    
    commitInfo.message = messageLines.join('\n');
    
    // 生成文件变更列表 HTML
    let filesHtml = commitInfo.stats.files.map((file, index) => `
        <div class="file-item" style="animation-delay: ${index * 0.05}s">
            <div class="file-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            </div>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <div class="file-stats">
                ${file.additions > 0 ? `<span class="stat-add">+${file.additions}</span>` : ''}
                ${file.deletions > 0 ? `<span class="stat-del">-${file.deletions}</span>` : ''}
            </div>
        </div>
    `).join('');
    
    // 生成 diff HTML
    let diffHtml = diffContent.map(item => {
        const escaped = escapeHtml(item.content);
        switch (item.type) {
            case 'file-header':
                return `<div class="diff-file-header">${escaped}</div>`;
            case 'hunk-header':
                return `<div class="diff-hunk">${escaped}</div>`;
            case 'addition':
                return `<div class="diff-add">${escaped}</div>`;
            case 'deletion':
                return `<div class="diff-del">${escaped}</div>`;
            default:
                return `<div class="diff-context">${escaped}</div>`;
        }
    }).join('');

    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>提交详情 - ${commitHash}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                min-height: 100vh;
                color: #1e293b;
            }
            
            .container {
                max-width: 1100px;
                margin: 0 auto;
                padding: 40px 24px;
            }
            
            @keyframes fadeInDown {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            
            .header {
                text-align: center;
                margin-bottom: 40px;
                animation: fadeInDown 0.6s ease-out;
            }
            
            .header-icon {
                width: 72px;
                height: 72px;
                background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                border-radius: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                box-shadow: 0 10px 40px rgba(249, 115, 22, 0.3);
            }
            
            .header-icon svg {
                width: 36px;
                height: 36px;
                color: white;
            }
            
            h1 {
                font-size: 28px;
                font-weight: 700;
                color: #0f172a;
                margin-bottom: 8px;
                letter-spacing: -0.5px;
            }
            
            .hash-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 14px;
                font-weight: 600;
                color: #0ea5e9;
                background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
                padding: 8px 16px;
                border-radius: 30px;
                border: 1px solid #bae6fd;
            }
            
            .hash-badge svg {
                width: 16px;
                height: 16px;
            }
            
            /* 提交信息卡片 */
            .commit-card {
                background: white;
                border-radius: 20px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 
                            0 10px 15px -3px rgba(0, 0, 0, 0.05);
                overflow: hidden;
                margin-bottom: 24px;
                border: 1px solid rgba(226, 232, 240, 0.8);
                animation: scaleIn 0.5s ease-out 0.1s both;
            }
            
            .commit-header {
                padding: 28px;
                background: linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%);
                border-bottom: 1px solid #e2e8f0;
            }
            
            .commit-message {
                font-size: 20px;
                font-weight: 600;
                color: #0f172a;
                margin-bottom: 20px;
                line-height: 1.4;
            }
            
            .commit-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 24px;
            }
            
            .meta-item {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .meta-icon {
                width: 36px;
                height: 36px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .meta-icon.author {
                background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
                color: #2563eb;
            }
            
            .meta-icon.date {
                background: linear-gradient(135deg, #dcfce7 0%, #ecfdf5 100%);
                color: #16a34a;
            }
            
            .meta-icon svg {
                width: 18px;
                height: 18px;
            }
            
            .meta-content {
                display: flex;
                flex-direction: column;
            }
            
            .meta-label {
                font-size: 12px;
                color: #64748b;
                font-weight: 500;
            }
            
            .meta-value {
                font-size: 14px;
                color: #1e293b;
                font-weight: 600;
            }
            
            /* 统计信息 */
            .stats-row {
                display: flex;
                padding: 20px 28px;
                gap: 32px;
                border-bottom: 1px solid #f1f5f9;
            }
            
            .stat-box {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .stat-number {
                font-size: 28px;
                font-weight: 700;
            }
            
            .stat-number.green { color: #16a34a; }
            .stat-number.red { color: #dc2626; }
            .stat-number.blue { color: #2563eb; }
            
            .stat-text {
                font-size: 13px;
                color: #64748b;
                font-weight: 500;
            }
            
            /* 文件列表 */
            .files-section {
                padding: 20px 28px;
            }
            
            .section-title {
                font-size: 14px;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 16px;
            }
            
            .file-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                background: #f8fafc;
                border-radius: 12px;
                margin-bottom: 8px;
                animation: fadeInUp 0.4s ease-out both;
                transition: all 0.2s ease;
            }
            
            .file-item:hover {
                background: #f1f5f9;
                transform: translateX(4px);
            }
            
            .file-icon {
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #7c3aed;
            }
            
            .file-icon svg {
                width: 16px;
                height: 16px;
            }
            
            .file-name {
                flex: 1;
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                color: #334155;
                font-weight: 500;
            }
            
            .file-stats {
                display: flex;
                gap: 8px;
            }
            
            .stat-add, .stat-del {
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                font-weight: 600;
                padding: 4px 10px;
                border-radius: 6px;
            }
            
            .stat-add {
                background: #dcfce7;
                color: #16a34a;
            }
            
            .stat-del {
                background: #fee2e2;
                color: #dc2626;
            }
            
            /* Diff 区域 */
            .diff-card {
                background: white;
                border-radius: 20px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 
                            0 10px 15px -3px rgba(0, 0, 0, 0.05);
                overflow: hidden;
                border: 1px solid rgba(226, 232, 240, 0.8);
                animation: scaleIn 0.5s ease-out 0.2s both;
            }
            
            .diff-header {
                padding: 20px 28px;
                background: linear-gradient(to right, #fafbfc, #f8fafc);
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .diff-header-icon {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            }
            
            .diff-header-icon svg {
                width: 20px;
                height: 20px;
            }
            
            .diff-title {
                font-size: 18px;
                font-weight: 600;
                color: #1e293b;
            }
            
            .diff-content {
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                line-height: 1.6;
                overflow-x: auto;
            }
            
            .diff-file-header {
                background: linear-gradient(to right, #1e293b, #334155);
                color: #e2e8f0;
                padding: 12px 20px;
                font-weight: 600;
                border-top: 3px solid #6366f1;
                margin-top: 0;
            }
            
            .diff-file-header:first-child {
                margin-top: 0;
            }
            
            .diff-hunk {
                background: linear-gradient(to right, #dbeafe, #eff6ff);
                color: #1e40af;
                padding: 8px 20px;
                font-weight: 500;
            }
            
            .diff-add {
                background: linear-gradient(to right, #dcfce7, #f0fdf4);
                color: #166534;
                padding: 2px 20px;
                border-left: 3px solid #22c55e;
            }
            
            .diff-del {
                background: linear-gradient(to right, #fee2e2, #fef2f2);
                color: #991b1b;
                padding: 2px 20px;
                border-left: 3px solid #ef4444;
            }
            
            .diff-context {
                padding: 2px 20px;
                color: #475569;
                background: white;
            }
            
            .footer {
                text-align: center;
                padding: 32px;
                color: #94a3b8;
                font-size: 13px;
            }
            
            .footer a {
                color: #6366f1;
                text-decoration: none;
                font-weight: 500;
            }
            
            /* 滚动条 */
            ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            ::-webkit-scrollbar-track {
                background: #f1f5f9;
                border-radius: 4px;
            }
            
            ::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"></circle>
                        <line x1="1.05" y1="12" x2="7" y2="12"></line>
                        <line x1="17.01" y1="12" x2="22.96" y2="12"></line>
                    </svg>
                </div>
                <h1>提交详情</h1>
                <div class="hash-badge">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                    </svg>
                    ${commitInfo.hash}
                </div>
            </div>
            
            <div class="commit-card">
                <div class="commit-header">
                    <div class="commit-message">${escapeHtml(commitInfo.message) || '无提交信息'}</div>
                    <div class="commit-meta">
                        <div class="meta-item">
                            <div class="meta-icon author">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </div>
                            <div class="meta-content">
                                <span class="meta-label">作者</span>
                                <span class="meta-value">${escapeHtml(commitInfo.author) || '未知'}</span>
                            </div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-icon date">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <div class="meta-content">
                                <span class="meta-label">日期</span>
                                <span class="meta-value">${escapeHtml(commitInfo.date) || '未知'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="stats-row">
                    <div class="stat-box">
                        <span class="stat-number green">+${commitInfo.stats.additions}</span>
                        <span class="stat-text">新增行</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number red">-${commitInfo.stats.deletions}</span>
                        <span class="stat-text">删除行</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number blue">${commitInfo.stats.files.length}</span>
                        <span class="stat-text">文件变更</span>
                    </div>
                </div>
                
                <div class="files-section">
                    <div class="section-title">变更文件</div>
                    ${filesHtml || '<div class="file-item">暂无文件变更信息</div>'}
                </div>
            </div>
            
            <div class="diff-card">
                <div class="diff-header">
                    <div class="diff-header-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3v18"></path>
                            <rect x="4" y="8" width="6" height="8" rx="1"></rect>
                            <rect x="14" y="8" width="6" height="8" rx="1"></rect>
                        </svg>
                    </div>
                    <span class="diff-title">代码差异</span>
                </div>
                <div class="diff-content">
                    ${diffHtml || '<div class="diff-context" style="padding: 20px;">暂无差异信息</div>'}
                </div>
            </div>
            
            <div class="footer">
                由 <a href="#">Git AI 自动化测试</a> · Alex Deng
            </div>
        </div>
    </body>
    </html>`;
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 侧边栏 Webview 视图提供器
 */
class SidebarViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = undefined;
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._updateWebview();

        // 监听来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'generate1':
                    vscode.commands.executeCommand('gitTestChecklist.generate1');
                    break;
                case 'generate5':
                    vscode.commands.executeCommand('gitTestChecklist.generate5');
                    break;
                case 'generate10':
                    vscode.commands.executeCommand('gitTestChecklist.generate10');
                    break;
                case 'generateCustom':
                    vscode.commands.executeCommand('gitTestChecklist.generate');
                    break;
                case 'enableHook':
                    vscode.commands.executeCommand('gitTestChecklist.enableGitHook');
                    break;
                case 'disableHook':
                    vscode.commands.executeCommand('gitTestChecklist.disableGitHook');
                    break;
                case 'generateEnhanced':
                    vscode.commands.executeCommand('gitTestChecklist.generateEnhanced');
                    break;
                case 'generateByAuthor':
                    vscode.commands.executeCommand('gitTestChecklist.generateByAuthor');
                    break;
                case 'generateByDate':
                    vscode.commands.executeCommand('gitTestChecklist.generateByDate');
                    break;
                case 'viewHistory':
                    vscode.commands.executeCommand('gitTestChecklist.viewHistory');
                    break;
                case 'openChecklist':
                    vscode.commands.executeCommand('gitTestChecklist.openChecklist');
                    break;
                case 'viewCommit':
                    vscode.commands.executeCommand('gitTestChecklist.viewCommit', message.hash);
                    break;
                case 'refresh':
                    this._updateWebview();
                    break;
            }
        });
    }

    refresh() {
        if (this._view) {
            this._updateWebview();
        }
    }

    async _updateWebview() {
        if (!this._view) return;
        
        // 获取最近提交
        let commitsHtml = '';
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (workspaceFolder) {
            try {
                const { stdout } = await execPromise(
                    'git log --pretty=format:"%h|%s|%ar|%an" -8',
                    { cwd: workspaceFolder.uri.fsPath }
                );
                
                const commits = stdout.split('\n').filter(line => line.trim());
                commitsHtml = commits.map((commit, index) => {
                    const [hash, message, date] = commit.split('|');
                    return `
                        <div class="commit-item" onclick="viewCommit('${hash}')">
                            <div class="commit-dot"></div>
                            <div class="commit-msg">${escapeHtml(message)}</div>
                        </div>
                    `;
                }).join('');
            } catch (error) {
                commitsHtml = '<div class="empty-state">无法获取提交记录</div>';
            }
        } else {
            commitsHtml = '<div class="empty-state">请先打开一个 Git 项目</div>';
        }

        this._view.webview.html = this._getHtml(commitsHtml);
    }

    _getHtml(commitsHtml) {
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #fff;
                    color: #1e293b;
                    padding: 10px;
                    font-size: 12px;
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding-bottom: 8px;
                    margin-bottom: 10px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .logo {
                    width: 28px; height: 28px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border-radius: 6px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .logo svg { width: 14px; height: 14px; color: white; }
                .header-text { flex: 1; }
                .title { font-size: 13px; font-weight: 700; color: #0f172a; }
                .subtitle { font-size: 10px; color: #64748b; }
                .author { color: #8b5cf6; font-weight: 600; }
                
                .section { margin-bottom: 10px; }
                .section-title {
                    font-size: 9px; font-weight: 600; color: #9ca3af;
                    text-transform: uppercase; letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }
                
                .quick-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 4px;
                    margin-bottom: 6px;
                }
                .quick-btn {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 2px; padding: 8px 4px;
                    background: #f8fafc; border: 1px solid #e5e7eb;
                    border-radius: 6px; cursor: pointer;
                    transition: all 0.15s; font-family: inherit;
                }
                .quick-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
                .quick-icon {
                    width: 22px; height: 22px; border-radius: 5px;
                    display: flex; align-items: center; justify-content: center;
                }
                .quick-icon svg { width: 12px; height: 12px; }
                .quick-icon.purple { background: #ede9fe; color: #7c3aed; }
                .quick-icon.blue { background: #dbeafe; color: #2563eb; }
                .quick-icon.green { background: #dcfce7; color: #16a34a; }
                .quick-icon.orange { background: #ffedd5; color: #ea580c; }
                .quick-icon.pink { background: #fce7f3; color: #db2777; }
                .quick-icon.cyan { background: #cffafe; color: #0891b2; }
                .quick-label { font-size: 10px; font-weight: 500; color: #475569; }
                
                .btn {
                    display: flex; align-items: center; gap: 8px;
                    width: 100%; padding: 8px 10px;
                    background: #f8fafc; border: 1px solid #e5e7eb;
                    border-radius: 6px; cursor: pointer;
                    transition: all 0.15s; font-family: inherit;
                    text-align: left; margin-bottom: 4px;
                }
                .btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
                .btn-icon {
                    width: 24px; height: 24px; border-radius: 5px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .btn-icon svg { width: 12px; height: 12px; }
                .btn-text { font-size: 11px; font-weight: 500; color: #334155; }
                
                .btn-primary {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none; color: white;
                }
                .btn-primary:hover { opacity: 0.9; }
                .btn-primary .btn-icon { background: rgba(255,255,255,0.2); color: white; }
                .btn-primary .btn-text { color: white; }
                
                .tools-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 4px;
                }
                
                .divider { height: 1px; background: #e5e7eb; margin: 8px 0; }
                
                .commit-item {
                    display: flex; align-items: center; gap: 6px;
                    padding: 6px 8px; background: #f8fafc;
                    border: 1px solid #e5e7eb; border-radius: 5px;
                    cursor: pointer; margin-bottom: 3px;
                    transition: all 0.15s;
                }
                .commit-item:hover { background: #f1f5f9; }
                .commit-dot {
                    width: 6px; height: 6px;
                    background: #6366f1; border-radius: 50%;
                    flex-shrink: 0;
                }
                .commit-msg {
                    flex: 1; font-size: 11px; color: #334155;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .commit-hash {
                    font-size: 9px; font-weight: 600;
                    color: #6366f1; background: #ede9fe;
                    padding: 1px 4px; border-radius: 3px;
                    font-family: monospace;
                }
                
                .hook-tip {
                    font-size: 9px; color: #9ca3af; text-align: center;
                    margin-top: 6px; font-style: italic;
                }
                .refresh-header-btn {
                    width: 32px; height: 32px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none; border-radius: 8px;
                    cursor: pointer; display: flex;
                    align-items: center; justify-content: center;
                    transition: all 0.2s; flex-shrink: 0;
                }
                .refresh-header-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
                }
                .refresh-header-btn:active { transform: scale(0.95); }
                .refresh-header-btn svg { width: 16px; height: 16px; color: white; }
                .section-title-toggle {
                    font-size: 9px; font-weight: 600; color: #9ca3af;
                    text-transform: uppercase; letter-spacing: 0.5px;
                    margin-bottom: 6px; cursor: pointer;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 4px; border-radius: 4px;
                    transition: all 0.2s;
                }
                .section-title-toggle:hover { background: #f3f4f6; color: #6b7280; }
                .toggle-icon { width: 14px; height: 14px; transition: transform 0.2s; }
                .toggle-icon.open { transform: rotate(180deg); }
                .advanced-content { margin-top: 6px; }
                .refresh-btn {
                    display: flex; align-items: center; justify-content: center;
                    gap: 4px; width: 100%; padding: 6px;
                    background: transparent; border: 1px dashed #d1d5db;
                    border-radius: 5px; cursor: pointer;
                    font-family: inherit; font-size: 10px;
                    color: #9ca3af; margin-top: 6px;
                }
                .refresh-btn:hover { border-color: #9ca3af; color: #6b7280; background: #f9fafb; }
                .refresh-btn svg { width: 10px; height: 10px; }
                
                .empty-state { text-align: center; padding: 12px; color: #9ca3af; font-size: 11px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M9 11l3 3L22 4"></path>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                </div>
                <div class="header-text">
                    <div class="title">Git AI 自动化测试</div>
                    <div class="subtitle">by <span class="author">Alex Deng</span></div>
                </div>
                <button class="refresh-header-btn" onclick="send('refresh')" title="刷新">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
            </div>
            
            <div class="section">
                <div class="section-title">根据以下 Git 提交次数生成测试清单</div>
                <div class="quick-grid">
                    <button class="quick-btn" onclick="send('generate1')">
                        <div class="quick-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><line x1="1" y1="12" x2="7" y2="12"></line><line x1="17" y1="12" x2="23" y2="12"></line></svg></div>
                        <span class="quick-label">1 次</span>
                    </button>
                    <button class="quick-btn" onclick="send('generate5')">
                        <div class="quick-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><line x1="1" y1="12" x2="7" y2="12"></line><line x1="17" y1="12" x2="23" y2="12"></line></svg></div>
                        <span class="quick-label">5 次</span>
                    </button>
                    <button class="quick-btn" onclick="send('generate10')">
                        <div class="quick-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><line x1="1" y1="12" x2="7" y2="12"></line><line x1="17" y1="12" x2="23" y2="12"></line></svg></div>
                        <span class="quick-label">10 次</span>
                    </button>
                </div>
                <button class="btn btn-primary" onclick="send('generateCustom')">
                    <div class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>
                    <span class="btn-text">⚙️ 自定义数量...</span>
                </button>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title">🔔 Git 提交钩子</div>
                <div class="tools-row">
                    <button class="btn" onclick="send('enableHook')">
                        <div class="btn-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></div>
                        <span class="btn-text">开启</span>
                    </button>
                    <button class="btn" onclick="send('disableHook')">
                        <div class="btn-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg></div>
                        <span class="btn-text">关闭</span>
                    </button>
                </div>
                <div class="hook-tip">开启后，每次 git commit 自动更新清单</div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title">📊 查看</div>
                <div class="tools-row">
                    <button class="btn" onclick="send('viewHistory')">
                        <div class="btn-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg></div>
                        <span class="btn-text">历史图</span>
                    </button>
                    <button class="btn" onclick="send('openChecklist')">
                        <div class="btn-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>
                        <span class="btn-text">清单</span>
                    </button>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title">最近提交</div>
                <div class="commits-list">${commitsHtml}</div>
            </div>
            
            <div class="divider"></div>
            
            <div class="section">
                <div class="section-title-toggle" onclick="toggleAdvanced()">
                    <span>🔧 高级功能</span>
                    <svg class="toggle-icon" id="toggleIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="advanced-content" id="advancedContent" style="display: none;">
                    <button class="btn" onclick="send('generateEnhanced')">
                        <div class="btn-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
                        <span class="btn-text">增强版（含统计）</span>
                    </button>
                    <button class="btn" onclick="send('generateByAuthor')">
                        <div class="btn-icon pink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                        <span class="btn-text">按作者筛选</span>
                    </button>
                    <button class="btn" onclick="send('generateByDate')">
                        <div class="btn-icon cyan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                        <span class="btn-text">按日期范围</span>
                    </button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                function send(cmd) { vscode.postMessage({ command: cmd }); }
                function viewCommit(hash) { vscode.postMessage({ command: 'viewCommit', hash: hash }); }
                function toggleAdvanced() {
                    const content = document.getElementById('advancedContent');
                    const icon = document.getElementById('toggleIcon');
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        icon.classList.add('open');
                    } else {
                        content.style.display = 'none';
                        icon.classList.remove('open');
                    }
                }
            </script>
        </body>
        </html>`;
    }
}

/**
 * 开启 Git 钩子
 */
async function enableGitHook() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const gitDir = path.join(workspacePath, '.git');
    const gitHooksDir = path.join(gitDir, 'hooks');
    const postCommitPath = path.join(gitHooksDir, 'post-commit');
    
    // 检查 .git 目录是否存在
    if (!fs.existsSync(gitDir)) {
        vscode.window.showErrorMessage('当前目录不是 Git 仓库');
        return;
    }

    // 创建 hooks 目录（如果不存在）
    if (!fs.existsSync(gitHooksDir)) {
        fs.mkdirSync(gitHooksDir, { recursive: true });
    }

    // 备份已有的 post-commit 钩子
    if (fs.existsSync(postCommitPath)) {
        const existingContent = fs.readFileSync(postCommitPath, 'utf8');
        if (existingContent.includes('git-test-checklist')) {
            vscode.window.showInformationMessage('✅ Git 钩子已经开启');
            return;
        }
        // 备份原有钩子
        fs.writeFileSync(postCommitPath + '.backup', existingContent);
    }

    // 创建跨平台的 post-commit 钩子脚本
    const hookScript = `#!/bin/sh
# Git AI 自动化测试 - 提交钩子
# Created by git-test-checklist extension (Alex Deng)

# 获取提交信息
COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_HASH_FULL=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=format:"%s")
COMMIT_AUTHOR=$(git log -1 --pretty=format:"%an")
COMMIT_DATE=$(git log -1 --pretty=format:"%Y-%m-%d %H:%M:%S")

# 测试清单文件
CHECKLIST_FILE="test-checklist.md"

# 获取变更文件列表
CHANGED_FILES=$(git diff-tree --no-commit-id --name-status -r HEAD)
ADDED_COUNT=$(echo "$CHANGED_FILES" | grep -c "^A" || echo "0")
MODIFIED_COUNT=$(echo "$CHANGED_FILES" | grep -c "^M" || echo "0")
DELETED_COUNT=$(echo "$CHANGED_FILES" | grep -c "^D" || echo "0")

# 创建文件头（如果不存在）
if [ ! -f "$CHECKLIST_FILE" ]; then
    cat > "$CHECKLIST_FILE" << 'HEADER'
# 📋 Git 提交测试清单

> 🤖 由 **Git AI 自动化测试** 自动生成，每次提交后更新。
> 
> 作者：Alex Deng

---

HEADER
fi

# 生成测试建议（根据文件类型和提交信息）
TEST_SUGGESTIONS=""

# 检查提交信息关键词
case "$COMMIT_MSG" in
    *fix*|*bug*|*修复*|*修复*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🐛 验证 Bug 是否已修复
- [ ] 🔄 回归测试相关功能"
        ;;
esac

case "$COMMIT_MSG" in
    *feat*|*feature*|*新增*|*添加*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] ✨ 测试新功能完整流程
- [ ] 📱 测试不同场景下的表现"
        ;;
esac

case "$COMMIT_MSG" in
    *refactor*|*重构*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🔧 确认重构后功能不变
- [ ] ⚡ 性能测试"
        ;;
esac

case "$COMMIT_MSG" in
    *style*|*样式*|*UI*|*ui*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🎨 检查 UI 显示是否正常
- [ ] 📐 测试不同分辨率适配"
        ;;
esac

case "$COMMIT_MSG" in
    *api*|*API*|*接口*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🔌 API 接口测试
- [ ] 📊 验证返回数据格式"
        ;;
esac

case "$COMMIT_MSG" in
    *数据库*|*database*|*sql*|*SQL*)
        TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🗄️ 数据库迁移验证
- [ ] 💾 数据完整性检查"
        ;;
esac

# 根据文件类型添加建议
if echo "$CHANGED_FILES" | grep -q "\\.js\\$\\|\\.ts\\$"; then
    TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 📜 JavaScript/TypeScript 逻辑测试"
fi

if echo "$CHANGED_FILES" | grep -q "\\.css\\$\\|\\.scss\\$\\|\\.less\\$"; then
    TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🎨 样式变更视觉检查"
fi

if echo "$CHANGED_FILES" | grep -q "\\.html\\$\\|\\.vue\\$\\|\\.jsx\\$\\|\\.tsx\\$"; then
    TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🖼️ 页面渲染测试"
fi

if echo "$CHANGED_FILES" | grep -q "\\.json\\$"; then
    TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] ⚙️ 配置文件变更验证"
fi

if echo "$CHANGED_FILES" | grep -q "\\.sql\\$"; then
    TEST_SUGGESTIONS="$TEST_SUGGESTIONS
- [ ] 🗃️ SQL 脚本执行验证"
fi

# 如果没有特定建议，添加通用建议
if [ -z "$TEST_SUGGESTIONS" ]; then
    TEST_SUGGESTIONS="
- [ ] ✅ 功能测试
- [ ] 🔄 回归测试"
fi

# 生成文件变更表格
FILE_TABLE="| 状态 | 文件路径 |
|:----:|----------|"

echo "$CHANGED_FILES" | while IFS= read -r line; do
    if [ -n "$line" ]; then
        STATUS=$(echo "$line" | cut -f1)
        FILE=$(echo "$line" | cut -f2)
        case "$STATUS" in
            A) STATUS_ICON="➕ 新增" ;;
            M) STATUS_ICON="✏️ 修改" ;;
            D) STATUS_ICON="❌ 删除" ;;
            R*) STATUS_ICON="📝 重命名" ;;
            *) STATUS_ICON="$STATUS" ;;
        esac
        FILE_TABLE="$FILE_TABLE
| $STATUS_ICON | \\\`$FILE\\\` |"
    fi
done

# 追加新提交到清单
cat >> "$CHECKLIST_FILE" << COMMIT
## 📌 $COMMIT_MSG

| 属性 | 值 |
|------|-----|
| 🔖 哈希 | \`$COMMIT_HASH\` |
| 👤 作者 | $COMMIT_AUTHOR |
| 📅 时间 | $COMMIT_DATE |
| 📊 变更 | ➕$ADDED_COUNT ✏️$MODIFIED_COUNT ❌$DELETED_COUNT |

### 📁 变更文件

$FILE_TABLE

### 🧪 测试建议
$TEST_SUGGESTIONS
- [ ] 👀 代码审查

---

COMMIT

echo "✅ [Git Hook] 测试清单已更新: $CHECKLIST_FILE"
`;

    try {
        // 写入钩子文件（使用 Buffer 避免 BOM）
        const buffer = Buffer.from(hookScript, 'utf8');
        fs.writeFileSync(postCommitPath, buffer);
        
        // 设置执行权限
        if (process.platform !== 'win32') {
            fs.chmodSync(postCommitPath, 0o755);
        }
        
        // 确保 Git 使用正确的 hooks 路径
        try {
            await execPromise('git config core.hooksPath .git/hooks', { cwd: workspacePath });
        } catch (e) {
            // 忽略错误，可能已经是默认路径
        }
        
        vscode.window.showInformationMessage('✅ Git 钩子已开启！每次 git commit 后将自动更新测试清单');
        console.log('Git hook created at:', postCommitPath);
    } catch (error) {
        vscode.window.showErrorMessage(`开启 Git 钩子失败: ${error.message}`);
        console.error('Enable git hook error:', error);
    }
}

/**
 * 关闭 Git 钩子
 */
async function disableGitHook() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const postCommitPath = path.join(workspaceFolder.uri.fsPath, '.git', 'hooks', 'post-commit');
    const backupPath = postCommitPath + '.backup';
    
    if (!fs.existsSync(postCommitPath)) {
        vscode.window.showInformationMessage('Git 钩子未开启');
        return;
    }

    try {
        // 检查是否是我们创建的钩子
        const content = fs.readFileSync(postCommitPath, 'utf8');
        if (!content.includes('git-test-checklist')) {
            vscode.window.showWarningMessage('当前 post-commit 钩子不是由本插件创建的');
            return;
        }

        // 删除钩子
        fs.unlinkSync(postCommitPath);
        
        // 恢复备份（如果有）
        if (fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, postCommitPath);
            vscode.window.showInformationMessage('✅ Git 钩子已关闭，已恢复原有钩子');
        } else {
            vscode.window.showInformationMessage('✅ Git 钩子已关闭');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`关闭 Git 钩子失败: ${error.message}`);
    }
}

/**
 * 检查 Git 钩子状态
 */
function isGitHookEnabled(workspacePath) {
    const postCommitPath = path.join(workspacePath, '.git', 'hooks', 'post-commit');
    if (!fs.existsSync(postCommitPath)) return false;
    const content = fs.readFileSync(postCommitPath, 'utf8');
    return content.includes('git-test-checklist');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
